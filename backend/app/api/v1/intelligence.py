from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.feature import BusinessFeature
from app.schemas.intelligence import IntelligenceItem, IntelligenceOverviewResponse
from app.services.intelligence import IntelligenceService

router = APIRouter()


def _get_business_id(current_user: dict, business_id: str | None = None) -> str:
    memberships = current_user.get("memberships", [])
    if not memberships:
        raise HTTPException(status_code=403, detail="No business membership")
    if business_id:
        allowed = {m["business_id"] for m in memberships}
        if business_id not in allowed:
            raise HTTPException(status_code=403, detail="Not a member of this business")
        return business_id
    return memberships[0]["business_id"]


async def _require_advanced_reports(business_id: str, db: AsyncSession):
    r = await db.execute(
        select(BusinessFeature).where(
            BusinessFeature.business_id == business_id,
            BusinessFeature.feature_key == "advanced_reports",
        )
    )
    feat = r.scalars().first()
    if not feat or not feat.enabled:
        raise HTTPException(status_code=403, detail="Feature 'advanced_reports' is disabled for this business")


@router.get("/overview", response_model=IntelligenceOverviewResponse)
async def get_overview(
    window_days: Annotated[int, Query(ge=1, le=365)] = 30,
    lead_time_days: Annotated[int, Query(ge=1, le=90)] = 7,
    safety_days: Annotated[int, Query(ge=0, le=90)] = 3,
    coverage_days: Annotated[int, Query(ge=1, le=365)] = 30,
    location_id: Annotated[str | None, Query()] = None,
    category_id: Annotated[str | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
    sort_by: Annotated[str, Query()] = "urgency",
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _require_advanced_reports(bid, db)
    allowed_sort = {"urgency", "stockout_days", "velocity_desc", "stock_asc", "stock_desc", "name"}
    if sort_by not in allowed_sort:
        raise HTTPException(status_code=400, detail=f"Invalid sort_by. Must be one of: {', '.join(sorted(allowed_sort))}")
    return await IntelligenceService.get_overview(
        db,
        bid,
        window_days=window_days,
        lead_time_days=lead_time_days,
        safety_days=safety_days,
        coverage_days=coverage_days,
        location_id=location_id,
        category_id=category_id,
        search=search,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )


@router.get("/product/{product_id}", response_model=IntelligenceItem)
async def get_product_intelligence(
    product_id: str,
    window_days: Annotated[int, Query(ge=1, le=365)] = 30,
    lead_time_days: Annotated[int, Query(ge=1, le=90)] = 7,
    safety_days: Annotated[int, Query(ge=0, le=90)] = 3,
    coverage_days: Annotated[int, Query(ge=1, le=365)] = 30,
    location_id: Annotated[str | None, Query()] = None,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _require_advanced_reports(bid, db)
    try:
        return await IntelligenceService.get_product_intelligence(
            db,
            bid,
            product_id,
            window_days=window_days,
            lead_time_days=lead_time_days,
            safety_days=safety_days,
            coverage_days=coverage_days,
            location_id=location_id,
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
