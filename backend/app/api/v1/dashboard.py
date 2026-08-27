from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.schemas.dashboard import DashboardActivityItem, DashboardSummaryResponse
from app.services.reports import ReportService

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


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    return await ReportService.get_dashboard_summary(db, bid)


@router.get("/activity", response_model=list[DashboardActivityItem])
async def get_dashboard_activity(
    business_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    return await ReportService.get_dashboard_activity(db, bid, limit=limit)
