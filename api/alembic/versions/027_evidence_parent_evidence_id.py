"""add evidence.parent_evidence_id for Web Directories (gobuster) parent/child

Revision ID: 027_parent_evidence_id
Revises: 026_service_current_host_tags_from_item_tags
Create Date: 2025-03-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "027_parent_evidence_id"
down_revision: Union[str, None] = "026_service_current_host_tags_from_item_tags"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "evidence",
        sa.Column("parent_evidence_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "evidence_parent_evidence_id_fkey",
        "evidence",
        "evidence",
        ["parent_evidence_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_evidence_parent_evidence_id",
        "evidence",
        ["parent_evidence_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_evidence_parent_evidence_id", table_name="evidence")
    op.drop_constraint("evidence_parent_evidence_id_fkey", "evidence", type_="foreignkey")
    op.drop_column("evidence", "parent_evidence_id")
