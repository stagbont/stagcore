from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class PurchaseItemCreate(BaseModel):
    product_id: str | None = None
    quantity: int = Field(gt=0)
    unit_cost: Decimal = Field(default=Decimal("0.00"), ge=0)
    serial_number: str | None = Field(default=None, max_length=100)
    imei: str | None = Field(default=None, max_length=30)
    product_name: str | None = Field(default=None, max_length=255)
    notes: str | None = None


class PurchaseCreate(BaseModel):
    supplier_id: str | None = None
    location_id: str | None = None
    invoice_reference: str | None = Field(default=None, max_length=100)
    purchase_date: datetime | None = None
    payment_status: Literal["pending", "paid", "partial"] = "pending"
    notes: str | None = None
    items: list[PurchaseItemCreate] = Field(min_length=1)


class PurchaseUpdate(BaseModel):
    supplier_id: str | None = None
    location_id: str | None = None
    invoice_reference: str | None = Field(default=None, max_length=100)
    payment_status: Literal["pending", "paid", "partial"] | None = None
    notes: str | None = None


class PurchaseItemResponse(BaseModel):
    id: str
    purchase_id: str
    product_id: str | None = None
    quantity: int
    unit_cost: Decimal
    serial_number: str | None = None
    imei: str | None = None
    product_name: str | None = None
    notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PurchaseResponse(BaseModel):
    id: str
    business_id: str
    supplier_id: str | None = None
    location_id: str | None = None
    invoice_reference: str | None = None
    purchase_date: datetime
    status: str
    payment_status: str
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    items: list[PurchaseItemResponse] = []

    model_config = {"from_attributes": True}
