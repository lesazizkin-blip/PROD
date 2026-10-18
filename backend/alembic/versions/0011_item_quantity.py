"""Quantity belongs to an inventory position; old positions contain one unit."""

import sqlalchemy as sa

from alembic import op

revision = "0011_item_quantity"
down_revision = "0010_item_damage"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "items",
        sa.Column(
            "quantity",
            sa.Integer(),
            sa.CheckConstraint("quantity BETWEEN 1 AND 9999", name="ck_items_quantity"),
            nullable=False,
            server_default="1",
        ),
    )


def downgrade():
    op.drop_column("items", "quantity")
