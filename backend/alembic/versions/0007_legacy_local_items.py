"""Reconcile item columns in local databases stamped by the former QR/AI branch.

Production already has these columns through 0004/0005; its data is unchanged.
"""

import sqlalchemy as sa

from alembic import op

revision = "0007_legacy_local_items"
down_revision = "0005_ai_qr_merge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("items")}
    if "status" not in columns:
        with op.batch_alter_table("items") as batch:
            batch.add_column(
                sa.Column("status", sa.String(20), nullable=False, server_default="packed")
            )
        if "lost" in columns:
            op.execute("UPDATE items SET status = 'lost' WHERE lost")
            with op.batch_alter_table("items") as batch:
                batch.drop_column("lost")
    if "first_day" not in columns:
        with op.batch_alter_table("items") as batch:
            batch.add_column(
                sa.Column("first_day", sa.Boolean(), nullable=False, server_default=sa.false())
            )


def downgrade() -> None:
    # These columns belong to 0004/0005 in the unified graph. Their downgrades own removal.
    pass
