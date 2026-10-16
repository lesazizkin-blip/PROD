"""MoverMate: initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-16
"""

import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _dt(name: str, nullable: bool = False) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("move_date", sa.Date(), nullable=False),
        sa.Column("address_from", sa.String(300), nullable=True),
        sa.Column("address_to", sa.String(300), nullable=True),
        _dt("created_at"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "task_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("default_offset_days", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stage", "title", name="uq_task_templates_stage_title"),
    )
    op.create_table(
        "tips",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("topic", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("topic", "title", name="uq_tips_topic_title"),
    )
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("stage", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("assignee", sa.String(80), nullable=True),
        sa.Column("done", sa.Boolean(), nullable=False),
        _dt("done_at", nullable=True),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["task_templates.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "template_id", name="uq_tasks_project_template"),
    )
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])
    op.create_index("ix_tasks_project_stage", "tasks", ["project_id", "stage"])
    op.create_table(
        "boxes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("room", sa.String(60), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("fill_later", sa.Boolean(), nullable=False),
        _dt("remind_at", nullable=True),
        _dt("created_at"),
        _dt("updated_at"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "number", name="uq_boxes_project_number"),
    )
    op.create_index("ix_boxes_project_id", "boxes", ["project_id"])
    op.create_index("ix_boxes_project_room_status", "boxes", ["project_id", "room", "status"])
    op.create_table(
        "items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("box_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("name_norm", sa.String(120), nullable=False),
        sa.Column("lost", sa.Boolean(), nullable=False),
        _dt("created_at"),
        sa.ForeignKeyConstraint(["box_id"], ["boxes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_items_box_id", "items", ["box_id"])
    op.create_index("ix_items_name_norm", "items", ["name_norm"])
    op.create_table(
        "first_day_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_first_day_items_project_id", "first_day_items", ["project_id"])
    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("entity", sa.String(20), nullable=False),
        sa.Column("entity_id", sa.String(40), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        _dt("created_at"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_events_project_id", "events", ["project_id"])
    op.create_index("ix_events_project_id_id", "events", ["project_id", "id"])


def downgrade() -> None:
    for table in (
        "events",
        "first_day_items",
        "items",
        "boxes",
        "tasks",
        "tips",
        "task_templates",
        "projects",
    ):
        op.drop_table(table)
