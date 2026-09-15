"""Remove obsolete invoice pool tables.

Revision ID: 0004_drop_invoice_pools
Revises: 0003_sale_mark
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_drop_invoice_pools"
down_revision = "0003_sale_mark"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "invoice_reservations" in tables:
        op.drop_table("invoice_reservations")
    if "invoice_counters" in tables:
        op.drop_table("invoice_counters")


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "invoice_counters" not in tables:
        op.create_table(
            "invoice_counters",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.id"), nullable=False),
            sa.Column("period", sa.String(length=6), nullable=False),
            sa.Column("last_number", sa.Integer(), nullable=False, server_default="0"),
            sa.UniqueConstraint("business_id", "period", name="uq_invoice_counter_period"),
        )
        op.create_index("ix_invoice_counters_business_id", "invoice_counters", ["business_id"])
    if "invoice_reservations" not in tables:
        op.create_table(
            "invoice_reservations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.id"), nullable=False),
            sa.Column("device_id", sa.String(length=120), nullable=False),
            sa.Column("period", sa.String(length=6), nullable=False),
            sa.Column("start_number", sa.Integer(), nullable=False),
            sa.Column("end_number", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_invoice_reservations_business_id", "invoice_reservations", ["business_id"])
        op.create_index("ix_invoice_reservations_device_id", "invoice_reservations", ["device_id"])
