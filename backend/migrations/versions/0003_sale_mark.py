"""Add auditable sale marking fields.

Revision ID: 0003_sale_mark
Revises: 0002_sale_void
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_sale_mark"
down_revision = "0002_sale_void"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("sales")}
    if "marked_at" not in columns:
        op.add_column("sales", sa.Column("marked_at", sa.DateTime(timezone=True), nullable=True))
    if "marked_by" not in columns:
        op.add_column("sales", sa.Column("marked_by", sa.Integer(), nullable=True))
        op.create_foreign_key("fk_sales_marked_by_users", "sales", "users", ["marked_by"], ["id"])
    if "mark_type" not in columns:
        op.add_column("sales", sa.Column("mark_type", sa.String(length=20), nullable=True))
    if "mark_reason" not in columns:
        op.add_column("sales", sa.Column("mark_reason", sa.String(length=500), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("sales")}
    if "mark_reason" in columns:
        op.drop_column("sales", "mark_reason")
    if "mark_type" in columns:
        op.drop_column("sales", "mark_type")
    if "marked_by" in columns:
        foreign_keys = {key.get("name") for key in inspector.get_foreign_keys("sales")}
        if "fk_sales_marked_by_users" in foreign_keys:
            op.drop_constraint("fk_sales_marked_by_users", "sales", type_="foreignkey")
        op.drop_column("sales", "marked_by")
    if "marked_at" in columns:
        op.drop_column("sales", "marked_at")
