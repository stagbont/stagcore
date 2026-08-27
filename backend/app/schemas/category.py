from datetime import datetime

from pydantic import BaseModel, Field


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str | None = Field(default=None, max_length=100, pattern=r"^[a-z0-9-]+$")
    default_warranty_months: int = Field(default=12, ge=0, le=60)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    slug: str | None = Field(default=None, max_length=100, pattern=r"^[a-z0-9-]+$")
    default_warranty_months: int | None = Field(default=None, ge=0, le=60)


class CategoryResponse(BaseModel):
    id: str
    business_id: str
    name: str
    slug: str
    default_warranty_months: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
