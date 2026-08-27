"""phase7: warranties, warranty_claims, repairs

Revision ID: c7e3a9d4f01b
Revises: 9f1a2c8d3e04
Create Date: 2026-08-27 23:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7e3a9d4f01b'
down_revision: Union[str, Sequence[str], None] = '9f1a2c8d3e04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'warranties',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('business_id', sa.String(length=36), nullable=False),
        sa.Column('device_id', sa.String(length=36), nullable=True),
        sa.Column('sale_id', sa.String(length=36), nullable=True),
        sa.Column('sale_item_id', sa.String(length=36), nullable=True),
        sa.Column('customer_id', sa.String(length=36), nullable=True),
        sa.Column('warranty_months', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['sale_item_id'], ['sale_items.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_warranties_business_id', 'warranties', ['business_id'])
    op.create_index('ix_warranties_business_device', 'warranties', ['business_id', 'device_id'])
    op.create_index('ix_warranties_business_expires', 'warranties', ['business_id', 'expires_at'])
    op.create_index('ix_warranties_sale_id', 'warranties', ['sale_id'])
    op.create_index('ix_warranties_device_id', 'warranties', ['device_id'])

    op.create_table(
        'warranty_claims',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('business_id', sa.String(length=36), nullable=False),
        sa.Column('warranty_id', sa.String(length=36), nullable=False),
        sa.Column('device_id', sa.String(length=36), nullable=True),
        sa.Column('customer_id', sa.String(length=36), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('diagnosis', sa.Text(), nullable=True),
        sa.Column('resolution', sa.String(length=20), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['warranty_id'], ['warranties.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_warranty_claims_business_id', 'warranty_claims', ['business_id'])
    op.create_index('ix_warranty_claims_business_warranty', 'warranty_claims', ['business_id', 'warranty_id'])
    op.create_index('ix_warranty_claims_business_device', 'warranty_claims', ['business_id', 'device_id'])
    op.create_index('ix_warranty_claims_warranty_id', 'warranty_claims', ['warranty_id'])
    op.create_index('ix_warranty_claims_device_id', 'warranty_claims', ['device_id'])

    op.create_table(
        'repairs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('business_id', sa.String(length=36), nullable=False),
        sa.Column('customer_id', sa.String(length=36), nullable=True),
        sa.Column('device_id', sa.String(length=36), nullable=True),
        sa.Column('device_description', sa.Text(), nullable=True),
        sa.Column('problem_description', sa.Text(), nullable=False),
        sa.Column('technician_name', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('estimated_cost', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('actual_cost', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('location_id', sa.String(length=36), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('(device_id IS NOT NULL) OR (device_description IS NOT NULL)', name='ck_repair_device_or_description'),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['location_id'], ['locations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_repairs_business_id', 'repairs', ['business_id'])
    op.create_index('ix_repairs_business_status', 'repairs', ['business_id', 'status'])
    op.create_index('ix_repairs_device_id', 'repairs', ['device_id'])
    op.create_index('ix_repairs_customer_id', 'repairs', ['customer_id'])
    op.create_index('ix_repairs_location_id', 'repairs', ['location_id'])


def downgrade() -> None:
    op.drop_index('ix_repairs_location_id', table_name='repairs')
    op.drop_index('ix_repairs_customer_id', table_name='repairs')
    op.drop_index('ix_repairs_device_id', table_name='repairs')
    op.drop_index('ix_repairs_business_status', table_name='repairs')
    op.drop_index('ix_repairs_business_id', table_name='repairs')
    op.drop_table('repairs')
    op.drop_index('ix_warranty_claims_device_id', table_name='warranty_claims')
    op.drop_index('ix_warranty_claims_warranty_id', table_name='warranty_claims')
    op.drop_index('ix_warranty_claims_business_device', table_name='warranty_claims')
    op.drop_index('ix_warranty_claims_business_warranty', table_name='warranty_claims')
    op.drop_index('ix_warranty_claims_business_id', table_name='warranty_claims')
    op.drop_table('warranty_claims')
    op.drop_index('ix_warranties_device_id', table_name='warranties')
    op.drop_index('ix_warranties_sale_id', table_name='warranties')
    op.drop_index('ix_warranties_business_expires', table_name='warranties')
    op.drop_index('ix_warranties_business_device', table_name='warranties')
    op.drop_index('ix_warranties_business_id', table_name='warranties')
    op.drop_table('warranties')
