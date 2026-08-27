from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TransferCreate(BaseModel):
    product_id: str | None = None
    device_id: str | None = None
    from_location_id: str
    to_location_id: str
    quantity: int = Field(gt=0, default=1)
    notes: str | None = None


class TransferResponse(BaseModel):
    id: str
    business_id: str
    product_id: str | None
    device_id: str | None
    from_location_id: str
    to_location_id: str
    quantity: int
    status: str
    notes: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
