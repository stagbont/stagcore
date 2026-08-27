from datetime import datetime

from pydantic import BaseModel, Field

from app.models.feature import FEATURE_KEYS


class FeatureToggleRequest(BaseModel):
    feature_key: str = Field(description=f"One of: {', '.join(FEATURE_KEYS)}")
    enabled: bool


class FeatureResponse(BaseModel):
    id: str
    business_id: str
    feature_key: str
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FeatureListResponse(BaseModel):
    features: list[FeatureResponse]
