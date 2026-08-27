import enum
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MovementType(str, enum.Enum):
    PURCHASE = "PURCHASE"
    SALE = "SALE"
    CUSTOMER_RETURN = "CUSTOMER_RETURN"
    SUPPLIER_RETURN = "SUPPLIER_RETURN"
    DAMAGE = "DAMAGE"
    LOSS = "LOSS"
    ADJUSTMENT_IN = "ADJUSTMENT_IN"
    ADJUSTMENT_OUT = "ADJUSTMENT_OUT"
    TRANSFER_IN = "TRANSFER_IN"
    TRANSFER_OUT = "TRANSFER_OUT"


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    __table_args__ = (
        Index("ix_inventory_movements_business_id", "business_id"),
        Index("ix_inventory_movements_business_product", "business_id", "product_id"),
        Index("ix_inventory_movements_business_type", "business_id", "type"),
        Index("ix_inventory_movements_business_created", "business_id", "created_at"),
        Index("ix_inventory_movements_product_id", "product_id"),
        Index("ix_inventory_movements_location_id", "location_id"),
        Index("ix_inventory_movements_device_id", "device_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    location_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
