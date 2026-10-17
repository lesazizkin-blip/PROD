"""Independent damage marker; keep legacy item statuses for API compatibility."""

import sqlalchemy as sa

from alembic import op

revision = "0010_item_damage"
down_revision = "0009_city_prices"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "items", sa.Column("damaged", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.execute(sa.text("UPDATE items SET damaged = true WHERE status = 'damaged'"))


def downgrade():
    op.drop_column("items", "damaged")
