"""Цены на переезд по городам (справочник для калькулятора, заполняется при старте)."""

import sqlalchemy as sa

from alembic import op

revision = "0009_city_prices"
down_revision = "0008_expenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "city_prices",
        sa.Column("slug", sa.String(20), primary_key=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("mover_low", sa.Integer(), nullable=False),
        sa.Column("mover_high", sa.Integer(), nullable=False),
        sa.Column("movers_offers", sa.Integer(), nullable=False),
        sa.Column("truck_low", sa.Integer(), nullable=False),
        sa.Column("truck_high", sa.Integer(), nullable=False),
        sa.Column("trucks_offers", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(200), nullable=False),
        sa.Column("checked_on", sa.Date(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("city_prices")
