from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class SaleReturnItemCreate(BaseModel):
    sale_item_id: str
    quantity: int = Field(gt=0)
    refund_amount: Decimal | None = Field(default=None, ge=0)


class SaleReturnCreate(BaseModel):
    items: list[SaleReturnItemCreate] = Field(min_length=1)
    location_id: str | None = None
    reason: Literal["damaged", "wrong_item", "warranty", "other"] = "other"
    refund_method: Literal["cash", "mobile_money", "card"] | None = None
    restock: bool = True
    notes: str | None = None


class SaleReturnItemResponse(BaseModel):
    id: str
    sale_return_id: str
    sale_item_id: str | None
    product_id: str | None
    device_id: str | None
    quantity: int
    refund_amount: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


class SaleReturnResponse(BaseModel):
    id: str
    business_id: str
    sale_id: str
    location_id: str | None
    reason: str
    refund_method: str | None
    refund_amount: Decimal
    restock: bool
    notes: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    items: list[SaleReturnItemResponse] = []

    model_config = {"from_attributes": True}


class PurchaseReturnItemCreate(BaseModel):
    purchase_item_id: str
    quantity: int = Field(gt=0)


class PurchaseReturnCreate(BaseModel):
    items: list[PurchaseReturnItemCreate] = Field(min_length=1)
    location_id: str | None = None
    reason: Literal["damaged", "wrong_item", "overstock", "other"] = "other"
    notes: str | None = None


class PurchaseReturnItemResponse(BaseModel):
    id: str
    purchase_return_id: str
    purchase_item_id: str | None
    product_id: str | None
    device_id: str | None
    quantity: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PurchaseReturnResponse(BaseModel):
    id: str
    business_id: str
    purchase_id: str
    location_id: str | None
    reason: str
    notes: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    items: list[PurchaseReturnItemResponse] = []

    model_config = {"from_attributes": True}
