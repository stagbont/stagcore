import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WarrantyStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    VOID = "void"
    CLAIMED = "claimed"


class WarrantyClaimStatus(str, enum.Enum):
    OPEN = "open"
    DIAGNOSIS = "diagnosis"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    RESOLVED = "resolved"
    CLOSED = "closed"


class WarrantyClaimResolution(str, enum.Enum):
    REPAIR = "repair"
    REPLACE = "replace"
    REJECT = "reject"
    REFUND = "refund"


class Warranty(Base):
    __tablename__ = "warranties"
    __table_args__ = (
        Index("ix_warranties_business_id", "business_id"),
        Index("ix_warranties_business_device", "business_id", "device_id"),
        Index("ix_warranties_business_expires", "business_id", "expires_at"),
        Index("ix_warranties_sale_id", "sale_id"),
        Index("ix_warranties_device_id", "device_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    sale_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("sales.id", ondelete="SET NULL"), nullable=True)
    sale_item_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("sale_items.id", ondelete="SET NULL"), nullable=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    warranty_months: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=WarrantyStatus.ACTIVE.value)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class WarrantyClaim(Base):
    __tablename__ = "warranty_claims"
    __table_args__ = (
        Index("ix_warranty_claims_business_id", "business_id"),
        Index("ix_warranty_claims_business_warranty", "business_id", "warranty_id"),
        Index("ix_warranty_claims_business_device", "business_id", "device_id"),
        Index("ix_warranty_claims_warranty_id", "warranty_id"),
        Index("ix_warranty_claims_device_id", "device_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    warranty_id: Mapped[str] = mapped_column(String(36), ForeignKey("warranties.id", ondelete="CASCADE"), nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=WarrantyClaimStatus.OPEN.value)
    diagnosis: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution: Mapped[str | None] = mapped_column(String(20), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
