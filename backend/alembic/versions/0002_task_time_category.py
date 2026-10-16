"""Tasks: start and end time, category with a color

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-16
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.add_column(sa.Column("start_time", sa.Time(), nullable=True))
        batch.add_column(sa.Column("end_time", sa.Time(), nullable=True))
        batch.add_column(sa.Column("category", sa.String(40), nullable=True))
        batch.add_column(sa.Column("category_color", sa.String(7), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("category_color")
        batch.drop_column("category")
        batch.drop_column("end_time")
        batch.drop_column("start_time")
