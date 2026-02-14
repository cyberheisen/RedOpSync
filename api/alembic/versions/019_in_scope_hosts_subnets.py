"""add in_scope to hosts and subnets for out-of-scope node

Revision ID: 019_in_scope
Revises: 018_whois
Create Date: 2025-02-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019_in_scope"
down_revision: Union[str, None] = "018_whois"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "subnets",
        sa.Column("in_scope", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "hosts",
        sa.Column("in_scope", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("hosts", "in_scope")
    op.drop_column("subnets", "in_scope")
