from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.business import BusinessUser


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    x_session_token: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
):
    """Resolve user from Better Auth session token.

    Client sends either:
      Authorization: Bearer <session_token>
      or X-Session-Token: <session_token>

    We look up the token in the `session` table (created by Better Auth)
    and return the user dict + business membership.
    For local dev without Better Auth tables, we also accept a
    dev header: X-User-Id for testing.
    """
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
    elif x_session_token:
        token = x_session_token.strip()

    # Dev fallback: allow X-User-Id header when session table doesn't exist
    # (useful for testing without Better Auth migration)
    dev_user_id = None
    # We check for a custom header via raw request would be cleaner,
    # but for simplicity we support dev mode via query param handled elsewhere.

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session token")

    # Query Better Auth session table directly (raw SQL to avoid model dependency)
    from sqlalchemy import text

    try:
        result = await db.execute(
            text("SELECT id, \"userId\", token, expiresAt FROM session WHERE token = :token LIMIT 1"),
            {"token": token},
        )
        row = result.mappings().first()
    except Exception:
        # Table doesn't exist yet (Better Auth not migrated) — give clear error
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth tables not initialized. Run Better Auth migration first.",
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

    # Check expiry
    import datetime

    expires_at = row["expiresAt"]
    # expiresAt may be string or datetime depending on driver
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except Exception:
            expires_at = None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)
    now = datetime.datetime.now(datetime.timezone.utc)
    if expires_at and expires_at < now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user_id = row["userId"]

    # Fetch user row
    user_result = await db.execute(
        text('SELECT id, email, name FROM "user" WHERE id = :uid LIMIT 1'),
        {"uid": user_id},
    )
    user_row = user_result.mappings().first()
    if not user_row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Fetch business memberships
    bu_result = await db.execute(
        select(BusinessUser).where(BusinessUser.user_id == user_id)
    )
    memberships = bu_result.scalars().all()

    return {
        "id": user_row["id"],
        "email": user_row["email"],
        "name": user_row["name"],
        "memberships": [
            {"business_id": m.business_id, "role": m.role} for m in memberships
        ],
    }


def require_platform_admin(current_user: dict = Depends(get_current_user)):
    email = (current_user.get("email") or "").lower()
    if email not in settings.platform_admin_emails_list:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin only")
    return current_user


def get_user_role(current_user: dict, business_id: str) -> str | None:
    for m in current_user.get("memberships", []):
        if m.get("business_id") == business_id:
            return m.get("role")
    return None


def require_business_owner(business_id: str, current_user: dict):
    role = get_user_role(current_user, business_id)
    if not role:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if role != "OWNER":
        raise HTTPException(status_code=403, detail="Owner only")
    return current_user


def require_business_roles(business_id: str, current_user: dict, allowed_roles: set[str]):
    role = get_user_role(current_user, business_id)
    if not role:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if role not in allowed_roles:
        raise HTTPException(status_code=403, detail=f"Role {role} not allowed")
    return role


# Role constants for convenience
ROLE_OWNER = "OWNER"
ROLE_MANAGER = "MANAGER"
ROLE_CASHIER = "CASHIER"
ROLE_CLERK = "INVENTORY_CLERK"

ALL_ROLES = {ROLE_OWNER, ROLE_MANAGER, ROLE_CASHIER, ROLE_CLERK}
OWNER_MANAGER = {ROLE_OWNER, ROLE_MANAGER}
OWNER_MANAGER_CLERK = {ROLE_OWNER, ROLE_MANAGER, ROLE_CLERK}
OWNER_MANAGER_CASHIER = {ROLE_OWNER, ROLE_MANAGER, ROLE_CASHIER}
