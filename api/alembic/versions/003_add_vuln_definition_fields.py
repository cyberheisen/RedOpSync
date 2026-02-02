"""add vulnerability definition cve, discovered_by, evidence_md

Revision ID: 003
Revises: 002
Create Date: 2025-01-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vulnerability_definitions", sa.Column("cve_ids", postgresql.ARRAY(sa.Text()), nullable=True))
    op.add_column("vulnerability_definitions", sa.Column("discovered_by", sa.String(64), nullable=True))
    op.add_column("vulnerability_definitions", sa.Column("evidence_md", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("vulnerability_definitions", "evidence_md")
    op.drop_column("vulnerability_definitions", "discovered_by")
    op.drop_column("vulnerability_definitions", "cve_ids")
