import enum
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RepairStatus(str, enum.Enum):
    RECEIVED = "received"
    DIAGNOSIS = "diagnosis"
    AWAITING_PARTS = "awaiting_parts"
    REPAIRING = "repairing"
    READY_FOR_PICKUP = "ready_for_pickup"
    COLLECTED = "collected"
    CANCELLED = "cancelled"


# Strict linear FSM: only adjacent forward transitions, plus cancelled from any non-terminal
REPAIR_ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    RepairStatus.RECEIVED.value: [RepairStatus.DIAGNOSIS.value, RepairStatus.CANCELLED.value],
    RepairStatus.DIAGNOSIS.value: [RepairStatus.AWAITING_PARTS.value, RepairStatus.CANCELLED.value],
    RepairStatus.AWAITING_PARTS.value: [RepairStatus.REPAIRING.value, RepairStatus.CANCELLED.value],
    RepairStatus.REPAIRING.value: [RepairStatus.READY_FOR_PICKUP.value, RepairStatus.CANCELLED.value],
    RepairStatus.READY_FOR_PICKUP.value: [RepairStatus.COLLECTED.value, RepairStatus.CANCELLED.value],
    RepairStatus.COLLECTED.value: [],
    RepairStatus.CANCELLED.value: [],
}


class Repair(Base):
    __tablename__ = "repairs"
    __table_args__ = (
        Index("ix_repairs_business_id", "business_id"),
        Index("ix_repairs_business_status", "business_id", "status"),
        Index("ix_repairs_device_id", "device_id"),
        Index("ix_repairs_customer_id", "customer_id"),
        Index("ix_repairs_location_id", "location_id"),
        CheckConstraint("(device_id IS NOT NULL) OR (device_description IS NOT NULL)", name="ck_repair_device_or_description"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    device_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    problem_description: Mapped[str] = mapped_column(Text, nullable=False)
    technician_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=RepairStatus.RECEIVED.value)
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    actual_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    location_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
