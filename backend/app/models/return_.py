import enum
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SaleReturnReason(str, enum.Enum):
    DAMAGED = "damaged"
    WRONG_ITEM = "wrong_item"
    WARRANTY = "warranty"
    OTHER = "other"


class PurchaseReturnReason(str, enum.Enum):
    DAMAGED = "damaged"
    WRONG_ITEM = "wrong_item"
    OVERSTOCK = "overstock"
    OTHER = "other"


class SaleReturn(Base):
    __tablename__ = "sale_returns"
    __table_args__ = (
        Index("ix_sale_returns_business_id", "business_id"),
        Index("ix_sale_returns_sale_id", "sale_id"),
        Index("ix_sale_returns_location_id", "location_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    sale_id: Mapped[str] = mapped_column(String(36), ForeignKey("sales.id", ondelete="CASCADE"), nullable=False)
    location_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    reason: Mapped[str] = mapped_column(String(30), nullable=False, default=SaleReturnReason.OTHER.value)
    refund_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    restock: Mapped[bool] = mapped_column(nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class SaleReturnItem(Base):
    __tablename__ = "sale_return_items"
    __table_args__ = (
        Index("ix_sale_return_items_return_id", "sale_return_id"),
        Index("ix_sale_return_items_sale_item_id", "sale_item_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sale_return_id: Mapped[str] = mapped_column(String(36), ForeignKey("sale_returns.id", ondelete="CASCADE"), nullable=False)
    sale_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("sale_items.id", ondelete="SET NULL"), nullable=True)
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class PurchaseReturn(Base):
    __tablename__ = "purchase_returns"
    __table_args__ = (
        Index("ix_purchase_returns_business_id", "business_id"),
        Index("ix_purchase_returns_purchase_id", "purchase_id"),
        Index("ix_purchase_returns_location_id", "location_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    purchase_id: Mapped[str] = mapped_column(String(36), ForeignKey("purchases.id", ondelete="CASCADE"), nullable=False)
    location_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    reason: Mapped[str] = mapped_column(String(30), nullable=False, default=PurchaseReturnReason.OTHER.value)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PurchaseReturnItem(Base):
    __tablename__ = "purchase_return_items"
    __table_args__ = (
        Index("ix_purchase_return_items_return_id", "purchase_return_id"),
        Index("ix_purchase_return_items_purchase_item_id", "purchase_item_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    purchase_return_id: Mapped[str] = mapped_column(String(36), ForeignKey("purchase_returns.id", ondelete="CASCADE"), nullable=False)
    purchase_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("purchase_items.id", ondelete="SET NULL"), nullable=True)
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
