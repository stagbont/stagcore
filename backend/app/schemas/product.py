from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    sku: str | None = Field(default=None, max_length=100)
    barcode: str | None = Field(default=None, max_length=100)
    category_id: str | None = None
    supplier_id: str | None = None
    brand: str | None = Field(default=None, max_length=100)
    cost_price: Decimal = Field(default=Decimal("0.00"), ge=0)
    selling_price: Decimal = Field(default=Decimal("0.00"), ge=0)
    minimum_stock_level: int = Field(default=0, ge=0)
    unit_of_measurement: str = Field(default="pcs", max_length=50)
    status: str = Field(default="active", pattern=r"^(active|inactive)$")
    product_image: str | None = Field(default=None, max_length=500)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    sku: str | None = Field(default=None, max_length=100)
    barcode: str | None = Field(default=None, max_length=100)
    category_id: str | None = None
    supplier_id: str | None = None
    brand: str | None = Field(default=None, max_length=100)
    cost_price: Decimal | None = Field(default=None, ge=0)
    selling_price: Decimal | None = Field(default=None, ge=0)
    minimum_stock_level: int | None = Field(default=None, ge=0)
    unit_of_measurement: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, pattern=r"^(active|inactive)$")
    product_image: str | None = Field(default=None, max_length=500)


class ProductResponse(BaseModel):
    id: str
    business_id: str
    name: str
    sku: str | None
    barcode: str | None
    category_id: str | None
    supplier_id: str | None
    brand: str | None
    cost_price: Decimal
    selling_price: Decimal
    minimum_stock_level: int
    unit_of_measurement: str
    status: str
    product_image: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
