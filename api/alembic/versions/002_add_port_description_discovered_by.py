"""add port description and discovered_by

Revision ID: 002
Revises: 001
Create Date: 2025-01-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ports", sa.Column("description_md", sa.Text(), nullable=True))
    op.add_column("ports", sa.Column("discovered_by", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("ports", "discovered_by")
    op.drop_column("ports", "description_md")
