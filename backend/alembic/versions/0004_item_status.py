"""Items: status (packed, unpacked, lost, found, damaged) instead of the lost flag

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-17
"""

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("items") as batch:
        batch.add_column(
            sa.Column("status", sa.String(20), nullable=False, server_default="packed")
        )
    op.execute("UPDATE items SET status = 'lost' WHERE lost")
    with op.batch_alter_table("items") as batch:
        batch.drop_column("lost")


def downgrade() -> None:
    with op.batch_alter_table("items") as batch:
        batch.add_column(sa.Column("lost", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE items SET lost = (status = 'lost')")
    with op.batch_alter_table("items") as batch:
        batch.drop_column("status")
