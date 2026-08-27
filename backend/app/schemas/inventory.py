from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class MovementCreate(BaseModel):
    product_id: str | None = None
    device_id: str | None = None
    type: Literal["PURCHASE", "SALE", "CUSTOMER_RETURN", "SUPPLIER_RETURN", "DAMAGE", "LOSS", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "TRANSFER_IN", "TRANSFER_OUT"]
    quantity: int = Field(gt=0)
    location_id: str | None = None
    unit_cost: Decimal | None = None
    reference: str | None = Field(default=None, max_length=500)
    notes: str | None = None


class AdjustRequest(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    direction: Literal["in", "out"]
    location_id: str | None = None
    reference: str | None = None
    notes: str | None = None


class ReceiveRequest(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    unit_cost: Decimal | None = None
    location_id: str | None = None
    reference: str | None = None
    notes: str | None = None


class SellRequest(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    location_id: str | None = None
    reference: str | None = None
    notes: str | None = None


class ReturnRequest(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    kind: Literal["customer", "supplier"]
    location_id: str | None = None
    reference: str | None = None
    notes: str | None = None


class MovementResponse(BaseModel):
    id: str
    business_id: str
    product_id: str | None
    location_id: str | None
    device_id: str | None
    type: str
    quantity: int
    unit_cost: Decimal | None
    reference: str | None
    created_by: str | None
    created_at: datetime
    notes: str | None

    model_config = {"from_attributes": True}


class StockResponse(BaseModel):
    product_id: str
    business_id: str
    current_stock: int
    location_id: str | None = None


class DeviceStatusChange(BaseModel):
    device_id: str
    to_status: Literal["in_stock", "sold", "in_repair", "returned"]
    location_id: str | None = None
    reference: str | None = None
    notes: str | None = None
