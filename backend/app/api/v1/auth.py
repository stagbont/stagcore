import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.business import Business, BusinessUser, UserRole
from app.models.feature import BusinessFeature, FEATURE_KEYS
from app.schemas.auth import RegisterRequest, SessionResponse
from app.schemas.business import BusinessResponse

router = APIRouter()


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "business"


@router.post("/register", response_model=BusinessResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register via Better Auth + create Business + BusinessUser.

    This endpoint is called AFTER the frontend has already created the user
    via Better Auth's /api/auth/sign-up/email. It creates the business
    and links the user as OWNER. If the Better Auth user doesn't exist yet,
    we return 404 and the frontend should retry after sign-up succeeds.

    Alternative flow: if the frontend calls this directly, we verify the user
    exists in the shared DB.
    """
    # Find Better Auth user by email
    result = await db.execute(text('SELECT id, email FROM "user" WHERE email = :email LIMIT 1'), {"email": payload.email})
    user_row = result.mappings().first()
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found. Sign up via Better Auth first.")

    user_id = user_row["id"]

    # Check if user already has a business
    existing = await db.execute(select(BusinessUser).where(BusinessUser.user_id == user_id).limit(1))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="User already belongs to a business")

    slug = payload.business_slug or _slugify(payload.business_name)
    # Ensure slug unique
    base_slug = slug
    counter = 1
    while True:
        check = await db.execute(select(Business).where(Business.slug == slug).limit(1))
        if not check.scalars().first():
            break
        counter += 1
        slug = f"{base_slug}-{counter}"

    business_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    business = Business(id=business_id, name=payload.business_name, slug=slug, created_at=now, updated_at=now)
    db.add(business)

    bu = BusinessUser(
        id=str(uuid.uuid4()),
        business_id=business_id,
        user_id=user_id,
        role=UserRole.OWNER.value,
        created_at=now,
    )
    db.add(bu)

    # Seed default feature flags (all disabled initially)
    for key in FEATURE_KEYS:
        db.add(
            BusinessFeature(
                id=str(uuid.uuid4()),
                business_id=business_id,
                feature_key=key,
                enabled=False,
                created_at=now,
                updated_at=now,
            )
        )

    await db.commit()
    await db.refresh(business)
    return business


@router.get("/session", response_model=SessionResponse)
async def get_session(current_user: dict = Depends(get_current_user)):
    return SessionResponse(user={"id": current_user["id"], "email": current_user["email"], "name": current_user["name"]}, memberships=current_user["memberships"])


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
