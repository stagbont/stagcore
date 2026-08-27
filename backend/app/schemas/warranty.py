from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class WarrantyResponse(BaseModel):
    id: str
    business_id: str
    device_id: str | None
    sale_id: str | None
    sale_item_id: str | None
    customer_id: str | None
    warranty_months: int
    start_date: datetime
    expires_at: datetime
    status: str
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    # computed
    is_expired: bool = False
    days_remaining: int | None = None
    is_valid: bool = True

    model_config = {"from_attributes": True}


class WarrantyValidityResponse(BaseModel):
    warranty_id: str
    is_expired: bool
    is_valid: bool
    days_remaining: int
    status: str


class WarrantyClaimCreate(BaseModel):
    warranty_id: str | None = None
    device_id: str | None = None
    customer_id: str | None = None
    diagnosis: str | None = None
    # resolution not set on create; set via update


class WarrantyClaimUpdate(BaseModel):
    status: Literal["open", "diagnosis", "awaiting_approval", "approved", "rejected", "resolved", "closed"] | None = None
    diagnosis: str | None = None
    resolution: Literal["repair", "replace", "reject", "refund"] | None = None
    resolution_notes: str | None = None


class WarrantyClaimResponse(BaseModel):
    id: str
    business_id: str
    warranty_id: str
    device_id: str | None
    customer_id: str | None
    status: str
    diagnosis: str | None
    resolution: str | None
    resolution_notes: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    # enriched
    is_expired: bool = False
    days_remaining: int | None = None

    model_config = {"from_attributes": True}
