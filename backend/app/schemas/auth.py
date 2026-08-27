from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str = Field(pattern=r"^[^@]+@[^@]+\.[^@]+$")
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    business_name: str = Field(min_length=2, max_length=255)
    business_slug: str | None = Field(default=None, max_length=100, pattern=r"^[a-z0-9-]+$")


class LoginRequest(BaseModel):
    email: str
    password: str


class SessionResponse(BaseModel):
    user: dict
    memberships: list[dict]
