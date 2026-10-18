"""Переезд на несколько дней: необязательная дата окончания (move_date - начало)."""

import sqlalchemy as sa

from alembic import op

revision = "0011_move_date_end"
down_revision = "0010_item_damage"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("move_date_end", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("projects", "move_date_end")
