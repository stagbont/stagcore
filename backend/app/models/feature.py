from datetime import datetime, timezone

from sqlalchemy import Boolean, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Togglable features per PRD
FEATURE_KEYS = [
    "warranty",
    "repairs",
    "multi_location",
    "barcode_scanning",
    "suppliers",
    "customers",
    "advanced_reports",
]


class BusinessFeature(Base):
    __tablename__ = "business_features"
    __table_args__ = (
        UniqueConstraint("business_id", "feature_key", name="uq_business_feature"),
        Index("ix_business_features_business_id", "business_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    feature_key: Mapped[str] = mapped_column(String(64), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    business: Mapped["Business"] = relationship(back_populates="features")
