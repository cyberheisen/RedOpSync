"""todos table for mission todo items

Revision ID: 012
Revises: 011
Create Date: 2025-02-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "todos",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("assigned_to_user_id", sa.UUID(), nullable=True),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completion_notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_todos_project_id", "todos", ["project_id"], unique=False)
    op.create_index("ix_todos_target_type_target_id", "todos", ["target_type", "target_id"], unique=False)
    op.create_index("ix_todos_assigned_to_user_id", "todos", ["assigned_to_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_todos_assigned_to_user_id", "todos")
    op.drop_index("ix_todos_target_type_target_id", "todos")
    op.drop_index("ix_todos_project_id", "todos")
    op.drop_table("todos")
