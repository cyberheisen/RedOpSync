"""Report builder: saved_reports definition_json, created_by, updated_at; service_current view

Revision ID: 024
Revises: 023_port_scan_metadata
Create Date: 2025-02-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "024"
down_revision: Union[str, None] = "023_port_scan_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extend saved_reports for report builder (definition as JSON, audit)
    op.add_column(
        "saved_reports",
        sa.Column("definition_json", JSONB, nullable=True),
    )
    op.add_column(
        "saved_reports",
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "saved_reports",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_saved_reports_created_by_user_id",
        "saved_reports",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_saved_reports_created_by_user_id", "saved_reports", ["created_by_user_id"], unique=False)

    # Indexes for report filters (mission_id = project_id on hosts; port filters on ports)
    op.create_index(
        "ix_ports_host_id_state",
        "ports",
        ["host_id", "state"],
        unique=False,
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_hosts_whois_data_gin ON hosts USING GIN (whois_data jsonb_path_ops)")

    # View: one row per (host, port) with latest snapshot fields for reporting
    op.execute("""
    CREATE OR REPLACE VIEW service_current AS
    SELECT
      h.project_id,
      h.id AS host_id,
      h.ip AS host_ip,
      h.dns_name AS host_fqdn,
      h.tags AS host_tags,
      h.whois_data,
      p.id AS service_id,
      p.protocol AS proto,
      p.number AS port,
      p.state,
      COALESCE(p.updated_at, p.scanned_at) AS last_seen,
      p.service_name,
      p.service_version,
      p.banner,
      p.scan_metadata,
      ev_latest.caption AS latest_evidence_caption,
      ev_latest.stored_path AS screenshot_path,
      (SELECT (regexp_matches(e.caption, 'Page title: (.+?) \\\\['))[1]
       FROM evidence e
       WHERE e.port_id = p.id AND e.source = 'gowitness' AND e.caption LIKE 'Page title:%%'
       ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
       LIMIT 1) AS latest_http_title,
      (SELECT (regexp_matches(e.caption, 'Server: (.+?) \\\\['))[1]
       FROM evidence e
       WHERE e.port_id = p.id AND e.source = 'gowitness' AND e.caption LIKE 'Server:%%'
       ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
       LIMIT 1) AS latest_http_server,
      (SELECT (regexp_matches(e.caption, 'Response code: ([0-9]+)'))[1]::int
       FROM evidence e
       WHERE e.port_id = p.id AND e.source = 'gowitness' AND e.caption LIKE 'Response code:%%'
       ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
       LIMIT 1) AS latest_http_status_code,
      (SELECT (regexp_matches(e.caption, 'Technologies: (.+?) \\\\['))[1]
       FROM evidence e
       WHERE e.port_id = p.id AND e.source = 'gowitness' AND e.caption LIKE 'Technologies:%%'
       ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
       LIMIT 1) AS latest_gowitness_tech
    FROM hosts h
    JOIN ports p ON p.host_id = h.id
    LEFT JOIN LATERAL (
      SELECT e.caption, e.stored_path
      FROM evidence e
      WHERE e.port_id = p.id AND e.source = 'gowitness'
      ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
      LIMIT 1
    ) ev_latest ON true
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS service_current")
    op.drop_index("ix_hosts_whois_data_gin", table_name="hosts", if_exists=True)
    op.drop_index("ix_ports_host_id_state", table_name="ports")
    op.drop_index("ix_saved_reports_created_by_user_id", table_name="saved_reports")
    op.drop_constraint("fk_saved_reports_created_by_user_id", "saved_reports", type_="foreignkey")
    op.drop_column("saved_reports", "updated_at")
    op.drop_column("saved_reports", "created_by_user_id")
    op.drop_column("saved_reports", "definition_json")
