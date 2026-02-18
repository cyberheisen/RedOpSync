"""add users.must_change_password for first-login prompt

Revision ID: 021_must_change_password
Revises: 020_evidence_source_timestamp
Create Date: 2025-02-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021_must_change_password"
down_revision: Union[str, None] = "020_evidence_source_timestamp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Force existing admin account to prompt for password change on next login
    op.execute("UPDATE users SET must_change_password = true WHERE username = 'admin'")


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
