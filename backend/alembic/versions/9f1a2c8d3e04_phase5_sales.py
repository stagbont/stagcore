"""phase5: sales and sale_items

Revision ID: 9f1a2c8d3e04
Revises: 7c3f2a9b1e05
Create Date: 2026-08-27 22:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9f1a2c8d3e04'
down_revision: Union[str, Sequence[str], None] = '7c3f2a9b1e05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sales',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('business_id', sa.String(length=36), nullable=False),
        sa.Column('customer_id', sa.String(length=36), nullable=True),
        sa.Column('location_id', sa.String(length=36), nullable=True),
        sa.Column('payment_method', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('sale_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['location_id'], ['locations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sales_business_id', 'sales', ['business_id'])
    op.create_index('ix_sales_business_date', 'sales', ['business_id', 'sale_date'])
    op.create_index('ix_sales_customer_id', 'sales', ['customer_id'])
    op.create_index('ix_sales_location_id', 'sales', ['location_id'])

    op.create_table(
        'sale_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('sale_id', sa.String(length=36), nullable=False),
        sa.Column('product_id', sa.String(length=36), nullable=True),
        sa.Column('device_id', sa.String(length=36), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('selling_price', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('discount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('warranty_months_override', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sale_items_sale_id', 'sale_items', ['sale_id'])
    op.create_index('ix_sale_items_product_id', 'sale_items', ['product_id'])
    op.create_index('ix_sale_items_device_id', 'sale_items', ['device_id'])


def downgrade() -> None:
    op.drop_index('ix_sale_items_device_id', table_name='sale_items')
    op.drop_index('ix_sale_items_product_id', table_name='sale_items')
    op.drop_index('ix_sale_items_sale_id', table_name='sale_items')
    op.drop_table('sale_items')
    op.drop_index('ix_sales_location_id', table_name='sales')
    op.drop_index('ix_sales_customer_id', table_name='sales')
    op.drop_index('ix_sales_business_date', table_name='sales')
    op.drop_index('ix_sales_business_id', table_name='sales')
    op.drop_table('sales')
