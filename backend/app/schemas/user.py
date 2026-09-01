from datetime import datetime

from pydantic import BaseModel, Field


class CreateMemberRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: str = Field(pattern=r"^[^@]+@[^@]+\.[^@]+$")
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern=r"^(OWNER|MANAGER|CASHIER|INVENTORY_CLERK)$")


class RoleUpdateRequest(BaseModel):
    role: str = Field(pattern=r"^(OWNER|MANAGER|CASHIER|INVENTORY_CLERK)$")


class MemberResponse(BaseModel):
    id: str
    business_id: str
    user_id: str
    email: str
    name: str | None
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
