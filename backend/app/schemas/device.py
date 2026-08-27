from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class DeviceCreate(BaseModel):
    product_name: str = Field(min_length=1, max_length=255)
    serial_number: str = Field(min_length=1, max_length=100)
    imei: str | None = Field(default=None, max_length=30)
    category_id: str | None = None
    supplier_id: str | None = None
    brand: str | None = Field(default=None, max_length=100)
    spec: dict[str, Any] | None = None
    cost_price: Decimal = Field(default=Decimal("0.00"), ge=0)
    selling_price: Decimal = Field(default=Decimal("0.00"), ge=0)
    status: str = Field(default="in_stock", pattern=r"^(in_stock|sold|in_repair|returned)$")
    location_id: str | None = None


class DeviceUpdate(BaseModel):
    product_name: str | None = Field(default=None, min_length=1, max_length=255)
    serial_number: str | None = Field(default=None, min_length=1, max_length=100)
    imei: str | None = Field(default=None, max_length=30)
    category_id: str | None = None
    supplier_id: str | None = None
    brand: str | None = Field(default=None, max_length=100)
    spec: dict[str, Any] | None = None
    cost_price: Decimal | None = Field(default=None, ge=0)
    selling_price: Decimal | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern=r"^(in_stock|sold|in_repair|returned)$")
    location_id: str | None = None


class DeviceResponse(BaseModel):
    id: str
    business_id: str
    product_name: str
    serial_number: str
    imei: str | None
    category_id: str | None
    supplier_id: str | None
    brand: str | None
    spec: dict[str, Any] | None
    cost_price: Decimal
    selling_price: Decimal
    status: str
    location_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
