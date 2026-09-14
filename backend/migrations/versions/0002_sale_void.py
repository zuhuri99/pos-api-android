"""Add auditable sale void fields.

Revision ID: 0002_sale_void
Revises: 0001_initial
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_sale_void"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 uses current metadata for fresh installations, so it may already
    # create these fields. Existing deployments still need ALTER TABLE.
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("sales")}
    if "voided_at" not in columns:
        op.add_column("sales", sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True))
    if "voided_by" not in columns:
        op.add_column("sales", sa.Column("voided_by", sa.Integer(), nullable=True))
        op.create_foreign_key("fk_sales_voided_by_users", "sales", "users", ["voided_by"], ["id"])
    if "void_reason" not in columns:
        op.add_column("sales", sa.Column("void_reason", sa.String(length=500), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("sales")}
    if "void_reason" in columns:
        op.drop_column("sales", "void_reason")
    if "voided_by" in columns:
        foreign_keys = {key.get("name") for key in inspector.get_foreign_keys("sales")}
        if "fk_sales_voided_by_users" in foreign_keys:
            op.drop_constraint("fk_sales_voided_by_users", "sales", type_="foreignkey")
        op.drop_column("sales", "voided_by")
    if "voided_at" in columns:
        op.drop_column("sales", "voided_at")
