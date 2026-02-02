"""add stored_path and is_pasted to evidence for port attachments

Revision ID: 005
Revises: 004
Create Date: 2025-01-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("evidence", sa.Column("stored_path", sa.String(1024), nullable=True))
    op.add_column("evidence", sa.Column("is_pasted", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("ports", sa.Column("evidence_md", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("ports", "evidence_md")
    op.drop_column("evidence", "is_pasted")
    op.drop_column("evidence", "stored_path")
