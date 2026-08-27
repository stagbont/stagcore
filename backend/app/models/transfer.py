import enum
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StockTransferStatus(str, enum.Enum):
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class StockTransfer(Base):
    __tablename__ = "stock_transfers"
    __table_args__ = (
        Index("ix_stock_transfers_business_id", "business_id"),
        Index("ix_stock_transfers_from_location", "from_location_id"),
        Index("ix_stock_transfers_to_location", "to_location_id"),
        Index("ix_stock_transfers_product_id", "product_id"),
        Index("ix_stock_transfers_device_id", "device_id"),
        CheckConstraint("from_location_id != to_location_id", name="ck_transfer_different_locations"),
        CheckConstraint("(product_id IS NOT NULL AND device_id IS NULL) OR (product_id IS NULL AND device_id IS NOT NULL)", name="ck_transfer_product_xor_device"),
        CheckConstraint("quantity > 0", name="ck_transfer_quantity_positive"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    from_location_id: Mapped[str] = mapped_column(String(36), ForeignKey("locations.id", ondelete="SET NULL"), nullable=False)
    to_location_id: Mapped[str] = mapped_column(String(36), ForeignKey("locations.id", ondelete="SET NULL"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=StockTransferStatus.COMPLETED.value)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
