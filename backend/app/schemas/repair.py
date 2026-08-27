from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class RepairCreate(BaseModel):
    customer_id: str | None = None
    device_id: str | None = None
    device_description: str | None = None
    problem_description: str = Field(min_length=1)
    technician_name: str | None = Field(default=None, max_length=100)
    estimated_cost: Decimal | None = Field(default=None, ge=0)
    actual_cost: Decimal | None = Field(default=None, ge=0)
    location_id: str | None = None

    @model_validator(mode="after")
    def check_device(self):
        if not self.device_id and not self.device_description:
            raise ValueError("Either device_id or device_description is required")
        return self


class RepairUpdate(BaseModel):
    customer_id: str | None = None
    device_id: str | None = None
    device_description: str | None = None
    problem_description: str | None = Field(default=None, min_length=1)
    technician_name: str | None = Field(default=None, max_length=100)
    status: Literal["received", "diagnosis", "awaiting_parts", "repairing", "ready_for_pickup", "collected", "cancelled"] | None = None
    estimated_cost: Decimal | None = Field(default=None, ge=0)
    actual_cost: Decimal | None = Field(default=None, ge=0)
    location_id: str | None = None


class RepairTransitionRequest(BaseModel):
    to_status: Literal["received", "diagnosis", "awaiting_parts", "repairing", "ready_for_pickup", "collected", "cancelled"]


class RepairResponse(BaseModel):
    id: str
    business_id: str
    customer_id: str | None
    device_id: str | None
    device_description: str | None
    problem_description: str
    technician_name: str | None
    status: str
    estimated_cost: Decimal | None
    actual_cost: Decimal | None
    location_id: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class DeviceHistoryResponse(BaseModel):
    device: dict | None = None
    warranties: list[dict] = []
    warranty_claims: list[dict] = []
    repairs: list[dict] = []
    sale: dict | None = None
    movements: list[dict] = []
