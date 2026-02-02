"""add evidence source, imported_at, source_file for traceability

Revision ID: 007
Revises: 006
Create Date: 2025-01-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("evidence", sa.Column("source", sa.String(64), nullable=True))
    op.add_column("evidence", sa.Column("imported_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("evidence", sa.Column("source_file", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("evidence", "source_file")
    op.drop_column("evidence", "imported_at")
    op.drop_column("evidence", "source")
