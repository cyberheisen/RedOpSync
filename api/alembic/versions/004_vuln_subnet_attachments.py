"""add vulnerability subnet associations and attachments

Revision ID: 004
Revises: 003
Create Date: 2025-01-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vulnerability_subnet_associations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vulnerability_definition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vulnerability_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subnet_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subnets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("vulnerability_definition_id", "subnet_id", name="uq_vuln_def_subnet"),
    )
    op.create_index("ix_vuln_subnet_def", "vulnerability_subnet_associations", ["vulnerability_definition_id"], unique=False)
    op.create_index("ix_vuln_subnet_subnet", "vulnerability_subnet_associations", ["subnet_id"], unique=False)

    op.create_table(
        "vulnerability_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vulnerability_definition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vulnerability_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("mime", sa.String(128), nullable=True),
        sa.Column("size", sa.Integer(), nullable=True),
        sa.Column("stored_path", sa.String(1024), nullable=False),
        sa.Column("uploaded_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_pasted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_vuln_attachments_def", "vulnerability_attachments", ["vulnerability_definition_id"], unique=False)


def downgrade() -> None:
    op.drop_table("vulnerability_attachments")
    op.drop_table("vulnerability_subnet_associations")
