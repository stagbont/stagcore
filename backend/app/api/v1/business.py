import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.business import Business, BusinessUser, UserRole
from app.models.feature import BusinessFeature, FEATURE_KEYS
from app.schemas.business import BusinessCreate, BusinessResponse

router = APIRouter()


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "business"


@router.get("/", response_model=list[BusinessResponse])
async def list_businesses(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user_id = current_user["id"]
    result = await db.execute(
        select(Business).join(BusinessUser, Business.id == BusinessUser.business_id).where(BusinessUser.user_id == user_id)
    )
    return result.scalars().all()


@router.get("/{business_id}", response_model=BusinessResponse)
async def get_business(business_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Enforce business_id scoping
    allowed_ids = {m["business_id"] for m in current_user["memberships"]}
    if business_id not in allowed_ids:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    result = await db.execute(select(Business).where(Business.id == business_id))
    business = result.scalars().first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


@router.post("/", response_model=BusinessResponse, status_code=status.HTTP_201_CREATED)
async def create_business(
    payload: BusinessCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    # Only OWNER can create additional businesses (or allow any member for v1)
    slug = payload.slug or _slugify(payload.name)
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
    business = Business(id=business_id, name=payload.name, slug=slug, created_at=now, updated_at=now)
    db.add(business)
    db.add(
        BusinessUser(
            id=str(uuid.uuid4()),
            business_id=business_id,
            user_id=current_user["id"],
            role=UserRole.OWNER.value,
            created_at=now,
        )
    )
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
