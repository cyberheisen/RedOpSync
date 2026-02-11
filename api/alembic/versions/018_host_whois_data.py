"""add whois_data to hosts for RDAP/whois import

Revision ID: 018_whois
Revises: 017_tags
Create Date: 2025-02-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "018_whois"
down_revision: Union[str, None] = "017_tags"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("hosts", sa.Column("whois_data", JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("hosts", "whois_data")
