"""Бюджет переезда: статьи расходов с планом и фактом."""

import sqlalchemy as sa

from alembic import op

revision = "0008_expenses"
down_revision = "0007_legacy_local_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("planned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("actual", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_expenses_project_id", "expenses", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_expenses_project_id", table_name="expenses")
    op.drop_table("expenses")
