"""add subnet_id to notes for subnet-scoped notes

Revision ID: 009
Revises: 008
Create Date: 2025-01-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("subnet_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_notes_subnet_id", "notes", "subnets", ["subnet_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_notes_subnet_id", "notes", ["subnet_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notes_subnet_id", "notes")
    op.drop_constraint("fk_notes_subnet_id", "notes", type_="foreignkey")
    op.drop_column("notes", "subnet_id")
