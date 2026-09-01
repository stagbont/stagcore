import hashlib
import os
import unicodedata
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_user_role
from app.models.auth import Account, User
from app.models.business import Business, BusinessUser, UserRole
from app.schemas.user import CreateMemberRequest, MemberResponse, RoleUpdateRequest

router = APIRouter()


def _hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    pwd_norm = unicodedata.normalize("NFKC", password)
    # Node scrypt uses salt string bytes (hex string UTF-8), not decoded hex
    key = hashlib.scrypt(
        pwd_norm.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=16384,
        r=16,
        p=1,
        dklen=64,
        maxmem=128 * 16384 * 16 * 2,
    )
    return f"{salt}:{key.hex()}"


def _require_can_manage(business_id: str, current_user: dict, target_role: str | None = None, target_current_role: str | None = None):
    role = get_user_role(current_user, business_id)
    if not role:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if role == UserRole.OWNER.value:
        return role
    if role == UserRole.MANAGER.value:
        # Manager can only manage CASHIER / INVENTORY_CLERK
        allowed_roles = {UserRole.CASHIER.value, UserRole.INVENTORY_CLERK.value}
        # Check target role being assigned
        if target_role and target_role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Manager can only manage Cashier and Inventory Clerk")
        if target_current_role and target_current_role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Manager can only manage Cashier and Inventory Clerk")
        # If no target specified (e.g. list), allow manager to proceed - they can view but mutations checked above
        return role
    raise HTTPException(status_code=403, detail="Owner or Manager only")


def _require_owner(business_id: str, current_user: dict):
    role = get_user_role(current_user, business_id)
    if not role:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if role != UserRole.OWNER.value:
        raise HTTPException(status_code=403, detail="Owner only")
    return role


@router.get("/{business_id}/members", response_model=list[MemberResponse])
async def list_members(
    business_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # must be member of business
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    # ensure business exists
    biz = await db.execute(select(Business).where(Business.id == business_id))
    if not biz.scalars().first():
        raise HTTPException(status_code=404, detail="Business not found")

    # fetch business_users
    bu_res = await db.execute(select(BusinessUser).where(BusinessUser.business_id == business_id).order_by(BusinessUser.created_at))
    bus = bu_res.scalars().all()
    if not bus:
        return []
    # fetch user details in one go via raw SQL
    user_ids = [b.user_id for b in bus]
    # Use SQLAlchemy text with expanding
    # Build placeholders
    placeholders = ",".join([f":uid{i}" for i in range(len(user_ids))])
    params = {f"uid{i}": uid for i, uid in enumerate(user_ids)}
    u_res = await db.execute(text(f'SELECT id, email, name FROM "user" WHERE id IN ({placeholders})'), params)
    user_map = {row.id: row for row in u_res.mappings().all()} if user_ids else {}
    # Also try via ORM fallback if needed
    result: list[MemberResponse] = []
    for bu in bus:
        u = user_map.get(bu.user_id)
        email = u["email"] if u else ""
        name = u["name"] if u else None
        # fallback ORM fetch if not found via raw (e.g. test DB with different mapping)
        if not u:
            try:
                orm_res = await db.execute(select(User).where(User.id == bu.user_id))
                orm_u = orm_res.scalars().first()
                if orm_u:
                    email = orm_u.email
                    name = orm_u.name
            except Exception:
                pass
        result.append(
            MemberResponse(
                id=bu.id,
                business_id=bu.business_id,
                user_id=bu.user_id,
                email=email,
                name=name,
                role=bu.role,
                created_at=bu.created_at,
            )
        )
    return result


@router.post("/{business_id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def create_member(
    business_id: str,
    payload: CreateMemberRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_can_manage(business_id, current_user, target_role=payload.role)

    biz = await db.execute(select(Business).where(Business.id == business_id))
    if not biz.scalars().first():
        raise HTTPException(status_code=404, detail="Business not found")

    email_norm = payload.email.strip().lower()
    # Check if BusinessUser already exists via user email lookup first
    # Lookup user by email (case-insensitive: use lower)
    existing_user_res = await db.execute(text('SELECT id, email, name FROM "user" WHERE lower(email) = :email LIMIT 1'), {"email": email_norm})
    existing_user_row = existing_user_res.mappings().first()
    # Also check ORM path
    if not existing_user_row:
        orm_u = await db.execute(select(User).where(User.email == email_norm))
        orm_first = orm_u.scalars().first()
        if orm_first:
            existing_user_row = {"id": orm_first.id, "email": orm_first.email, "name": orm_first.name}

    user_id = None
    user_email = email_norm
    user_name = payload.name

    if existing_user_row:
        user_id = existing_user_row["id"]
        user_email = existing_user_row["email"]
        user_name = existing_user_row["name"]
        # Check duplicate membership
        dup = await db.execute(select(BusinessUser).where(BusinessUser.business_id == business_id, BusinessUser.user_id == user_id))
        if dup.scalars().first():
            raise HTTPException(status_code=409, detail="User already a member of this business")
    else:
        # Create new Better Auth user + account
        now = datetime.now(timezone.utc)
        user_id = str(uuid.uuid4())
        hashed = _hash_password(payload.password)
        # Create User via ORM for test compat, and ensure raw insert works for both SQLite and Postgres
        try:
            user = User(
                id=user_id,
                name=payload.name,
                email=email_norm,
                emailVerified=False,
                createdAt=now,
                updatedAt=now,
            )
            db.add(user)
            await db.flush()
        except Exception:
            # Fallback raw SQL if ORM mapping fails (e.g. table not created via ORM)
            await db.execute(
                text('INSERT INTO "user" (id, name, email, \"emailVerified\", \"createdAt\", \"updatedAt\") VALUES (:id, :name, :email, :ev, :ca, :ua)'),
                {"id": user_id, "name": payload.name, "email": email_norm, "ev": False, "ca": now, "ua": now},
            )

        # Create Account
        try:
            acct = Account(
                id=str(uuid.uuid4()),
                accountId=user_id,
                providerId="credential",
                userId=user_id,
                password=hashed,
                createdAt=now,
                updatedAt=now,
            )
            db.add(acct)
            await db.flush()
        except Exception:
            await db.execute(
                text('INSERT INTO account (id, \"accountId\", \"providerId\", \"userId\", password, \"createdAt\", \"updatedAt\") VALUES (:id, :aid, :pid, :uid, :pw, :ca, :ua)'),
                {"id": str(uuid.uuid4()), "aid": user_id, "pid": "credential", "uid": user_id, "pw": hashed, "ca": now, "ua": now},
            )

    # Create BusinessUser linkage
    now2 = datetime.now(timezone.utc)
    bu = BusinessUser(
        id=str(uuid.uuid4()),
        business_id=business_id,
        user_id=user_id,
        role=payload.role,
        created_at=now2,
    )
    db.add(bu)
    await db.commit()
    await db.refresh(bu)

    return MemberResponse(
        id=bu.id,
        business_id=bu.business_id,
        user_id=bu.user_id,
        email=user_email,
        name=user_name,
        role=bu.role,
        created_at=bu.created_at,
    )


@router.patch("/{business_id}/members/{user_id}", response_model=MemberResponse)
async def update_member_role(
    business_id: str,
    user_id: str,
    payload: RoleUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fetch target first to know current role for hierarchy check
    res = await db.execute(select(BusinessUser).where(BusinessUser.business_id == business_id, BusinessUser.user_id == user_id))
    bu = res.scalars().first()
    if not bu:
        raise HTTPException(status_code=404, detail="Member not found")

    _require_can_manage(business_id, current_user, target_role=payload.role, target_current_role=bu.role)

    # Prevent demoting last OWNER
    if bu.role == UserRole.OWNER.value and payload.role != UserRole.OWNER.value:
        cnt_res = await db.execute(select(BusinessUser).where(BusinessUser.business_id == business_id, BusinessUser.role == UserRole.OWNER.value))
        owners = cnt_res.scalars().all()
        if len(owners) <= 1:
            raise HTTPException(status_code=409, detail="Cannot demote the last owner")

    bu.role = payload.role
    await db.commit()
    await db.refresh(bu)

    # Fetch user details
    u_res = await db.execute(text('SELECT id, email, name FROM "user" WHERE id = :uid LIMIT 1'), {"uid": user_id})
    u_row = u_res.mappings().first()
    email = ""
    name = None
    if u_row:
        email = u_row["email"]
        name = u_row["name"]
    else:
        try:
            orm_res = await db.execute(select(User).where(User.id == user_id))
            orm_u = orm_res.scalars().first()
            if orm_u:
                email = orm_u.email
                name = orm_u.name
        except Exception:
            pass

    return MemberResponse(
        id=bu.id,
        business_id=bu.business_id,
        user_id=bu.user_id,
        email=email,
        name=name,
        role=bu.role,
        created_at=bu.created_at,
    )


@router.delete("/{business_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    business_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fetch target for hierarchy check
    res = await db.execute(select(BusinessUser).where(BusinessUser.business_id == business_id, BusinessUser.user_id == user_id))
    bu_check = res.scalars().first()
    if not bu_check:
        raise HTTPException(status_code=404, detail="Member not found")
    _require_can_manage(business_id, current_user, target_current_role=bu_check.role)

    # Cannot remove self if last owner? Also prevent self-removal generally? Allow owner to remove others but not self if last owner
    if current_user.get("id") == user_id:
        # Check if last owner
        cnt_res = await db.execute(select(BusinessUser).where(BusinessUser.business_id == business_id, BusinessUser.role == UserRole.OWNER.value))
        owners = cnt_res.scalars().all()
        owner_ids = {o.user_id for o in owners}
        if user_id in owner_ids and len(owners) <= 1:
            raise HTTPException(status_code=409, detail="Cannot remove the last owner")

    bu = bu_check

    # Prevent removing last OWNER
    if bu.role == UserRole.OWNER.value:
        cnt_res = await db.execute(select(BusinessUser).where(BusinessUser.business_id == business_id, BusinessUser.role == UserRole.OWNER.value))
        owners = cnt_res.scalars().all()
        if len(owners) <= 1:
            raise HTTPException(status_code=409, detail="Cannot remove the last owner")

    await db.delete(bu)
    await db.commit()
