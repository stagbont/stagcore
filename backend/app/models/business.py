import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# We store user_id as String FK to Better Auth's "user" table.
# Better Auth creates that table; we don't own it, but we reference it.


class UserRole(str, enum.Enum):
    OWNER = "OWNER"
    MANAGER = "MANAGER"
    CASHIER = "CASHIER"
    INVENTORY_CLERK = "INVENTORY_CLERK"


class Business(Base):
    __tablename__ = "businesses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    business_users: Mapped[list["BusinessUser"]] = relationship(back_populates="business", cascade="all, delete-orphan")
    features: Mapped[list["BusinessFeature"]] = relationship(back_populates="business", cascade="all, delete-orphan")


class BusinessUser(Base):
    __tablename__ = "business_users"
    __table_args__ = (
        UniqueConstraint("business_id", "user_id", name="uq_business_user"),
        Index("ix_business_users_business_id", "business_id"),
        Index("ix_business_users_user_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[str] = mapped_column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)  # FK to "user".id logically, no DB constraint until Better Auth tables exist
    role: Mapped[str] = mapped_column(String(32), nullable=False, default=UserRole.OWNER.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    business: Mapped["Business"] = relationship(back_populates="business_users")
