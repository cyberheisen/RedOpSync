"""add evidence_id to notes for evidence-scoped notes

Revision ID: 010
Revises: 009
Create Date: 2025-01-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("evidence_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_notes_evidence_id", "notes", "evidence", ["evidence_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_notes_evidence_id", "notes", ["evidence_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notes_evidence_id", "notes")
    op.drop_constraint("fk_notes_evidence_id", "notes", type_="foreignkey")
    op.drop_column("notes", "evidence_id")
