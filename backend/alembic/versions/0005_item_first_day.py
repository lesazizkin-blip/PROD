"""Items: first_day flag (the item is needed on the first day in the new home)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-17
"""

import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("items") as batch:
        batch.add_column(
            sa.Column("first_day", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("items") as batch:
        batch.drop_column("first_day")
