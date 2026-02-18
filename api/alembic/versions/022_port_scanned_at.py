"""add ports.scanned_at for tool execution time (e.g. masscan timestamp)

Revision ID: 022_port_scanned_at
Revises: 021_must_change_password
Create Date: 2025-02-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "022_port_scanned_at"
down_revision: Union[str, None] = "021_must_change_password"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ports",
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ports", "scanned_at")
