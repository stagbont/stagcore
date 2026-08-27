"""phase4: purchases and purchase_items

Revision ID: 7c3f2a9b1e05
Revises: 2a1f3abe4c59
Create Date: 2026-08-27 21:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7c3f2a9b1e05'
down_revision: Union[str, Sequence[str], None] = '2a1f3abe4c59'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'purchases',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('business_id', sa.String(length=36), nullable=False),
        sa.Column('supplier_id', sa.String(length=36), nullable=True),
        sa.Column('location_id', sa.String(length=36), nullable=True),
        sa.Column('invoice_reference', sa.String(length=100), nullable=True),
        sa.Column('purchase_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('payment_status', sa.String(length=20), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['location_id'], ['locations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_purchases_business_id', 'purchases', ['business_id'])
    op.create_index('ix_purchases_business_date', 'purchases', ['business_id', 'purchase_date'])
    op.create_index('ix_purchases_supplier_id', 'purchases', ['supplier_id'])
    op.create_index('ix_purchases_location_id', 'purchases', ['location_id'])

    op.create_table(
        'purchase_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('purchase_id', sa.String(length=36), nullable=False),
        sa.Column('product_id', sa.String(length=36), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_cost', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('serial_number', sa.String(length=100), nullable=True),
        sa.Column('imei', sa.String(length=30), nullable=True),
        sa.Column('product_name', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['purchase_id'], ['purchases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_purchase_items_purchase_id', 'purchase_items', ['purchase_id'])
    op.create_index('ix_purchase_items_product_id', 'purchase_items', ['product_id'])


def downgrade() -> None:
    op.drop_index('ix_purchase_items_product_id', table_name='purchase_items')
    op.drop_index('ix_purchase_items_purchase_id', table_name='purchase_items')
    op.drop_table('purchase_items')
    op.drop_index('ix_purchases_location_id', table_name='purchases')
    op.drop_index('ix_purchases_supplier_id', table_name='purchases')
    op.drop_index('ix_purchases_business_date', table_name='purchases')
    op.drop_index('ix_purchases_business_id', table_name='purchases')
    op.drop_table('purchases')
