from datetime import datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.schemas.report import (
    InventoryReportResponse,
    ProductPerformanceReportResponse,
    ProfitReportResponse,
    SalesReportResponse,
    SupplierReportResponse,
)
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


def _parse_date_range(
    start_date: datetime | None,
    end_date: datetime | None,
    default_days: int = 30,
) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    if not end_date:
        end_date = datetime.combine(now.date(), time.max, tzinfo=timezone.utc)
    elif end_date.tzinfo is None:
        end_date = end_date.replace(tzinfo=timezone.utc)

    if not start_date:
        start_date = datetime.combine((now - timedelta(days=default_days)).date(), time.min, tzinfo=timezone.utc)
    elif start_date.tzinfo is None:
        start_date = start_date.replace(tzinfo=timezone.utc)

    return start_date, end_date


@router.get("/sales", response_model=SalesReportResponse)
async def get_sales_report(
    business_id: Annotated[str | None, Query()] = None,
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
    location_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    start_dt, end_dt = _parse_date_range(start_date, end_date)
    return await ReportService.get_sales_report(db, bid, start_dt, end_dt, location_id=location_id)


@router.get("/inventory", response_model=InventoryReportResponse)
async def get_inventory_report(
    business_id: Annotated[str | None, Query()] = None,
    location_id: Annotated[str | None, Query()] = None,
    category_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    return await ReportService.get_inventory_report(db, bid, location_id=location_id, category_id=category_id)


@router.get("/profit", response_model=ProfitReportResponse)
async def get_profit_report(
    business_id: Annotated[str | None, Query()] = None,
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    start_dt, end_dt = _parse_date_range(start_date, end_date)
    return await ReportService.get_profit_report(db, bid, start_dt, end_dt)


@router.get("/product-performance", response_model=ProductPerformanceReportResponse)
async def get_product_performance_report(
    business_id: Annotated[str | None, Query()] = None,
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    start_dt, end_dt = _parse_date_range(start_date, end_date)
    return await ReportService.get_product_performance(db, bid, start_dt, end_dt)


@router.get("/suppliers", response_model=SupplierReportResponse)
async def get_supplier_report(
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    return await ReportService.get_supplier_report(db, bid)
