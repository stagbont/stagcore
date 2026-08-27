from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class SaleItemCreate(BaseModel):
    product_id: str | None = None
    device_id: str | None = None
    quantity: int = Field(gt=0)
    selling_price: Decimal = Field(ge=0, default=Decimal("0.00"))
    discount: Decimal = Field(ge=0, default=Decimal("0.00"))
    warranty_months_override: int | None = Field(default=None, ge=0, le=60)


class SaleCreate(BaseModel):
    customer_id: str | None = None
    location_id: str | None = None
    payment_method: Literal["cash", "mobile_money", "card"] = "cash"
    sale_date: datetime | None = None
    notes: str | None = None
    items: list[SaleItemCreate] = Field(min_length=1)


class SaleUpdate(BaseModel):
    customer_id: str | None = None
    location_id: str | None = None
    notes: str | None = None


class SaleItemResponse(BaseModel):
    id: str
    sale_id: str
    product_id: str | None = None
    device_id: str | None = None
    quantity: int
    selling_price: Decimal
    discount: Decimal
    warranty_months_override: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SaleResponse(BaseModel):
    id: str
    business_id: str
    customer_id: str | None = None
    location_id: str | None = None
    payment_method: str
    status: str
    sale_date: datetime
    total_amount: Decimal
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    items: list[SaleItemResponse] = []

    model_config = {"from_attributes": True}
