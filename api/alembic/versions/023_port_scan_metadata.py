"""add ports.scan_metadata JSONB for nmap/tool metadata (state reason, confidence, devicetype, etc.)

Revision ID: 023_port_scan_metadata
Revises: 022_port_scanned_at
Create Date: 2025-02-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "023_port_scan_metadata"
down_revision: Union[str, None] = "022_port_scanned_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ports",
        sa.Column("scan_metadata", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ports", "scan_metadata")
