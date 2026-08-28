from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class IntelligenceParams(BaseModel):
    window_days: int = Field(30, ge=1, le=365, description="Sales velocity window in days")
    lead_time_days: int = Field(7, ge=1, le=90, description="Supplier lead time in days")
    safety_days: int = Field(3, ge=0, le=90, description="Safety buffer in days")
    coverage_days: int = Field(30, ge=1, le=365, description="Forward coverage to order for")


class IntelligenceItem(BaseModel):
    product_id: str
    name: str
    sku: str | None = None
    category_id: str | None = None
    category_name: str | None = None
    current_stock: int
    minimum_stock_level: int
    total_units_sold_in_window: int
    daily_velocity: Decimal
    days_until_stockout: int | None = None
    estimated_stockout_date: date | None = None
    reorder_point: Decimal
    suggested_order_qty: int
    stock_status: str
    valuation: Decimal
    cost_price: Decimal
    selling_price: Decimal


class CategoryIntelligenceBreakdown(BaseModel):
    category_id: str | None
    category_name: str
    product_count: int
    units_in_stock: int
    total_valuation: Decimal


class IntelligenceOverviewResponse(BaseModel):
    params: IntelligenceParams
    generated_at: datetime
    window_start: datetime
    window_end: datetime
    total_items: int
    critical_count: int
    low_count: int
    out_of_stock_count: int
    stable_count: int
    ok_count: int
    items: list[IntelligenceItem]
    category_breakdown: list[CategoryIntelligenceBreakdown] = []
