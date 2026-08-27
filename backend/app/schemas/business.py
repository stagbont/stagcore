from datetime import datetime

from pydantic import BaseModel, Field


class BusinessCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: str | None = Field(default=None, max_length=100, pattern=r"^[a-z0-9-]+$")


class BusinessResponse(BaseModel):
    id: str
    name: str
    slug: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BusinessUserCreate(BaseModel):
    user_id: str
    role: str = Field(pattern=r"^(OWNER|MANAGER|CASHIER|INVENTORY_CLERK)$")


class BusinessUserResponse(BaseModel):
    id: str
    business_id: str
    user_id: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
