"""saved_reports table for custom report builder saves

Revision ID: 011
Revises: 010
Create Date: 2025-02-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saved_reports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("data_source", sa.String(64), nullable=False),
        sa.Column("columns", postgresql.JSONB(), nullable=False),
        sa.Column("filter_expression", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saved_reports_project_id", "saved_reports", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_saved_reports_project_id", "saved_reports")
    op.drop_table("saved_reports")
