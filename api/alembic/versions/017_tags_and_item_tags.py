"""tags and item_tags tables for mission-based tagging

Revision ID: 017_tags
Revises: 016_notes_target
Create Date: 2025-02-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "017_tags"
down_revision: Union[str, None] = "016_notes_target"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("color", sa.String(32), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tags_project_id", "tags", ["project_id"], unique=False)

    op.create_table(
        "item_tags",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("tag_id", UUID(as_uuid=True), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tag_id", "target_type", "target_id", name="uq_item_tag_target"),
    )
    op.create_index("ix_item_tags_tag_id", "item_tags", ["tag_id"], unique=False)
    op.create_index("ix_item_tags_target", "item_tags", ["target_type", "target_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_item_tags_target", "item_tags")
    op.drop_index("ix_item_tags_tag_id", "item_tags")
    op.drop_table("item_tags")
    op.drop_index("ix_tags_project_id", "tags")
    op.drop_table("tags")
