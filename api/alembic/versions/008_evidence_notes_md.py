"""add notes_md to evidence for per-evidence notes

Revision ID: 008
Revises: 007
Create Date: 2025-01-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("evidence", sa.Column("notes_md", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("evidence", "notes_md")
