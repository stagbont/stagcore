from datetime import datetime

from pydantic import BaseModel, Field


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str | None = Field(default=None, max_length=100, pattern=r"^[a-z0-9-]+$")
    address: str | None = Field(default=None, max_length=500)
    is_active: bool = True


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    slug: str | None = Field(default=None, max_length=100, pattern=r"^[a-z0-9-]+$")
    address: str | None = None
    is_active: bool | None = None


class LocationResponse(BaseModel):
    id: str
    business_id: str
    name: str
    slug: str | None
    address: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
