"""Mirror of Better Auth tables for local dev and testing.

Better Auth normally creates these via its own CLI (Drizzle/pg).
For local SQLite dev and backend tests we create compatible tables
via SQLAlchemy so the shared DB works without a separate migration.
When using Postgres + Better Auth CLI, these tables already exist and
create_all is a no-op (checkfirst=True).
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    emailVerified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    image: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Session(Base):
    __tablename__ = "session"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    expiresAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    token: Mapped[str] = mapped_column(String(512), unique=True, nullable=False, index=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    ipAddress: Mapped[str | None] = mapped_column(String(100), nullable=True)
    userAgent: Mapped[str | None] = mapped_column(Text, nullable=True)
    userId: Mapped[str] = mapped_column(String(36), nullable=False, index=True)


class Account(Base):
    __tablename__ = "account"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    accountId: Mapped[str] = mapped_column(String(255), nullable=False)
    providerId: Mapped[str] = mapped_column(String(255), nullable=False)
    issuer: Mapped[str] = mapped_column(String(512), nullable=False, default="local:credential")
    userId: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    accessToken: Mapped[str | None] = mapped_column(Text, nullable=True)
    refreshToken: Mapped[str | None] = mapped_column(Text, nullable=True)
    idToken: Mapped[str | None] = mapped_column(Text, nullable=True)
    accessTokenExpiresAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refreshTokenExpiresAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    password: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Verification(Base):
    __tablename__ = "verification"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    expiresAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
