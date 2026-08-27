import enum
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DeviceStatus(str, enum.Enum):
    IN_STOCK = "in_stock"
    SOLD = "sold"
    IN_REPAIR = "in_repair"
    RETURNED = "returned"


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (
        UniqueConstraint("business_id", "serial_number", name="uq_device_business_serial"),
        Index("ix_devices_business_id", "business_id"),
        Index("ix_devices_business_serial", "business_id", "serial_number"),
        Index("ix_devices_business_imei", "business_id", "imei"),
        Index("ix_devices_category_id", "category_id"),
        Index("ix_devices_supplier_id", "supplier_id"),
        Index("ix_devices_status", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    serial_number: Mapped[str] = mapped_column(String(100), nullable=False)
    imei: Mapped[str | None] = mapped_column(String(30), nullable=True)
    category_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    supplier_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    spec: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    selling_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=DeviceStatus.IN_STOCK.value)
    location_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # FK to locations (Phase 3)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
