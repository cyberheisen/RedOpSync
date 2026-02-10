"""Add target_type and target_id to notes. Notes live where they were created (same as todos).

Revision ID: 016_notes_target
Revises:
Create Date: 2025-02-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "016_notes_target"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("target_type", sa.String(32), nullable=False, server_default="scope"))
    op.add_column("notes", sa.Column("target_id", UUID(as_uuid=True), nullable=True))
    # Backfill: set target_type and target_id from existing FKs
    op.execute("""
        UPDATE notes SET target_type = 'port', target_id = port_id
        WHERE port_id IS NOT NULL
    """)
    op.execute("""
        UPDATE notes SET target_type = 'host', target_id = host_id
        WHERE host_id IS NOT NULL AND port_id IS NULL
    """)
    op.execute("""
        UPDATE notes SET target_type = 'subnet', target_id = subnet_id
        WHERE subnet_id IS NOT NULL AND host_id IS NULL AND port_id IS NULL
    """)
    op.execute("""
        UPDATE notes SET target_type = 'evidence', target_id = evidence_id
        WHERE evidence_id IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column("notes", "target_id")
    op.drop_column("notes", "target_type")
