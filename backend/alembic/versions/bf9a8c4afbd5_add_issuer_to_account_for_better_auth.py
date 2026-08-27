"""add issuer to account for better-auth

Revision ID: bf9a8c4afbd5
Revises: 808e49bd2776
Create Date: 2026-08-27 20:14:21.493506

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bf9a8c4afbd5'
down_revision: Union[str, Sequence[str], None] = '808e49bd2776'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add issuer column to account for Better Auth (required since v1.3)."""
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("account")]
    if "issuer" not in columns:
        op.add_column("account", sa.Column("issuer", sa.String(length=512), nullable=False, server_default="local:credential"))


def downgrade() -> None:
    """Remove issuer column."""
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("account")]
    if "issuer" in columns:
        op.drop_column("account", "issuer")
