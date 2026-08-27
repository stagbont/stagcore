import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.business import Business
from app.models.feature import BusinessFeature, FEATURE_KEYS
from app.schemas.feature import FeatureListResponse, FeatureResponse, FeatureToggleRequest

router = APIRouter()


def _require_business_member(business_id: str, current_user: dict):
    allowed = {m["business_id"] for m in current_user["memberships"]}
    # Platform admin can access any business
    if current_user["email"].lower() in settings.platform_admin_emails_list:
        return
    if business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")


@router.get("/{business_id}/features", response_model=FeatureListResponse)
async def list_features(business_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _require_business_member(business_id, current_user)
    # Verify business exists
    exists = await db.execute(select(Business).where(Business.id == business_id))
    if not exists.scalars().first():
        raise HTTPException(status_code=404, detail="Business not found")

    result = await db.execute(select(BusinessFeature).where(BusinessFeature.business_id == business_id).order_by(BusinessFeature.feature_key))
    features = result.scalars().all()

    # If no rows yet (business created before feature seeding), return defaults
    if not features:
        now = datetime.now(timezone.utc)
        features = [
            BusinessFeature(id=str(uuid.uuid4()), business_id=business_id, feature_key=key, enabled=False, created_at=now, updated_at=now)
            for key in FEATURE_KEYS
        ]

    return FeatureListResponse(features=[FeatureResponse.model_validate(f) for f in features])


@router.post("/{business_id}/features", response_model=FeatureResponse)
async def toggle_feature(
    business_id: str, payload: FeatureToggleRequest, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    # Only platform admin can toggle
    if current_user["email"].lower() not in settings.platform_admin_emails_list:
        raise HTTPException(status_code=403, detail="Platform admin only")

    if payload.feature_key not in FEATURE_KEYS:
        raise HTTPException(status_code=400, detail=f"Invalid feature_key. Must be one of: {', '.join(FEATURE_KEYS)}")

    exists = await db.execute(select(Business).where(Business.id == business_id))
    if not exists.scalars().first():
        raise HTTPException(status_code=404, detail="Business not found")

    result = await db.execute(
        select(BusinessFeature).where(BusinessFeature.business_id == business_id, BusinessFeature.feature_key == payload.feature_key)
    )
    feature = result.scalars().first()
    now = datetime.now(timezone.utc)
    if feature:
        feature.enabled = payload.enabled
        feature.updated_at = now
    else:
        feature = BusinessFeature(
            id=str(uuid.uuid4()),
            business_id=business_id,
            feature_key=payload.feature_key,
            enabled=payload.enabled,
            created_at=now,
            updated_at=now,
        )
        db.add(feature)

    await db.commit()
    await db.refresh(feature)
    return FeatureResponse.model_validate(feature)
