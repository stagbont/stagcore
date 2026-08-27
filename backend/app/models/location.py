from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("business_id", "name", name="uq_location_business_name"),
        UniqueConstraint("business_id", "slug", name="uq_location_business_slug"),
        Index("ix_locations_business_id", "business_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
