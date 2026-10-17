"""Persist AI request budgets across workers and restarts.

Revision ID: 0004_ai_limits
Revises: 0003
"""

import sqlalchemy as sa

from alembic import op

revision = "0004_ai_limits"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_budgets",
        sa.Column("bucket", sa.String(100), primary_key=True),
        sa.Column("used", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ai_usage_budgets")
