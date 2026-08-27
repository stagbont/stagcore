"""phase8: stock_transfers, sale_returns, purchase_returns

Revision ID: f8a2c3d9e01a
Revises: c7e3a9d4f01b
Create Date: 2026-08-28 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f8a2c3d9e01a'
down_revision: Union[str, Sequence[str], None] = 'c7e3a9d4f01b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'stock_transfers',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('business_id', sa.String(length=36), nullable=False),
        sa.Column('product_id', sa.String(length=36), nullable=True),
        sa.Column('device_id', sa.String(length=36), nullable=True),
        sa.Column('from_location_id', sa.String(length=36), nullable=False),
        sa.Column('to_location_id', sa.String(length=36), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('from_location_id != to_location_id', name='ck_transfer_different_locations'),
        sa.CheckConstraint('(product_id IS NOT NULL AND device_id IS NULL) OR (product_id IS NULL AND device_id IS NOT NULL)', name='ck_transfer_product_xor_device'),
        sa.CheckConstraint('quantity > 0', name='ck_transfer_quantity_positive'),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['from_location_id'], ['locations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['to_location_id'], ['locations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_stock_transfers_business_id', 'stock_transfers', ['business_id'])
    op.create_index('ix_stock_transfers_from_location', 'stock_transfers', ['from_location_id'])
    op.create_index('ix_stock_transfers_to_location', 'stock_transfers', ['to_location_id'])
    op.create_index('ix_stock_transfers_product_id', 'stock_transfers', ['product_id'])
    op.create_index('ix_stock_transfers_device_id', 'stock_transfers', ['device_id'])

    op.create_table(
        'sale_returns',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('business_id', sa.String(length=36), nullable=False),
        sa.Column('sale_id', sa.String(length=36), nullable=False),
        sa.Column('location_id', sa.String(length=36), nullable=True),
        sa.Column('reason', sa.String(length=30), nullable=False),
        sa.Column('refund_method', sa.String(length=20), nullable=True),
        sa.Column('refund_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('restock', sa.Boolean(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['location_id'], ['locations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sale_returns_business_id', 'sale_returns', ['business_id'])
    op.create_index('ix_sale_returns_sale_id', 'sale_returns', ['sale_id'])
    op.create_index('ix_sale_returns_location_id', 'sale_returns', ['location_id'])

    op.create_table(
        'sale_return_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('sale_return_id', sa.String(length=36), nullable=False),
        sa.Column('sale_item_id', sa.String(length=36), nullable=True),
        sa.Column('product_id', sa.String(length=36), nullable=True),
        sa.Column('device_id', sa.String(length=36), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('refund_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['sale_return_id'], ['sale_returns.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sale_item_id'], ['sale_items.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sale_return_items_return_id', 'sale_return_items', ['sale_return_id'])
    op.create_index('ix_sale_return_items_sale_item_id', 'sale_return_items', ['sale_item_id'])

    op.create_table(
        'purchase_returns',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('business_id', sa.String(length=36), nullable=False),
        sa.Column('purchase_id', sa.String(length=36), nullable=False),
        sa.Column('location_id', sa.String(length=36), nullable=True),
        sa.Column('reason', sa.String(length=30), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['purchase_id'], ['purchases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['location_id'], ['locations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_purchase_returns_business_id', 'purchase_returns', ['business_id'])
    op.create_index('ix_purchase_returns_purchase_id', 'purchase_returns', ['purchase_id'])
    op.create_index('ix_purchase_returns_location_id', 'purchase_returns', ['location_id'])

    op.create_table(
        'purchase_return_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('purchase_return_id', sa.String(length=36), nullable=False),
        sa.Column('purchase_item_id', sa.String(length=36), nullable=True),
        sa.Column('product_id', sa.String(length=36), nullable=True),
        sa.Column('device_id', sa.String(length=36), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['purchase_return_id'], ['purchase_returns.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['purchase_item_id'], ['purchase_items.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_purchase_return_items_return_id', 'purchase_return_items', ['purchase_return_id'])
    op.create_index('ix_purchase_return_items_purchase_item_id', 'purchase_return_items', ['purchase_item_id'])


def downgrade() -> None:
    op.drop_index('ix_purchase_return_items_purchase_item_id', table_name='purchase_return_items')
    op.drop_index('ix_purchase_return_items_return_id', table_name='purchase_return_items')
    op.drop_table('purchase_return_items')
    op.drop_index('ix_purchase_returns_location_id', table_name='purchase_returns')
    op.drop_index('ix_purchase_returns_purchase_id', table_name='purchase_returns')
    op.drop_index('ix_purchase_returns_business_id', table_name='purchase_returns')
    op.drop_table('purchase_returns')
    op.drop_index('ix_sale_return_items_sale_item_id', table_name='sale_return_items')
    op.drop_index('ix_sale_return_items_return_id', table_name='sale_return_items')
    op.drop_table('sale_return_items')
    op.drop_index('ix_sale_returns_location_id', table_name='sale_returns')
    op.drop_index('ix_sale_returns_sale_id', table_name='sale_returns')
    op.drop_index('ix_sale_returns_business_id', table_name='sale_returns')
    op.drop_table('sale_returns')
    op.drop_index('ix_stock_transfers_device_id', table_name='stock_transfers')
    op.drop_index('ix_stock_transfers_product_id', table_name='stock_transfers')
    op.drop_index('ix_stock_transfers_to_location', table_name='stock_transfers')
    op.drop_index('ix_stock_transfers_from_location', table_name='stock_transfers')
    op.drop_index('ix_stock_transfers_business_id', table_name='stock_transfers')
    op.drop_table('stock_transfers')
