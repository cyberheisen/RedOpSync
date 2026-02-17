"""add evidence.source_timestamp for tool raw timestamps (e.g. gowitness probed_at)

Revision ID: 020_evidence_source_timestamp
Revises: 019_in_scope
Create Date: 2025-02-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020_evidence_source_timestamp"
down_revision: Union[str, None] = "019_in_scope"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "evidence",
        sa.Column("source_timestamp", sa.String(128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("evidence", "source_timestamp")
