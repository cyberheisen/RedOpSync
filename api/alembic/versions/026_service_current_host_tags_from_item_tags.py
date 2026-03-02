"""service_current: host_tags from item_tags+tags so report shows applied tags

Revision ID: 026
Revises: 025
Create Date: 2025-02-26

Report builder host_tags column was reading hosts.tags (legacy array), which is
never set when using the UI's Tag/ItemTag system. Define host_tags in the view
as tag names from item_tags+tags (host-level and port-level assignments) so
reports show the tags that have been applied.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "026"
down_revision: Union[str, None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP VIEW IF EXISTS service_current")
    op.execute("""
    CREATE VIEW service_current AS
    SELECT
      h.project_id,
      h.id AS host_id,
      h.ip AS host_ip,
      h.dns_name AS host_fqdn,
      (SELECT COALESCE(array_agg(DISTINCT tg.name), '{}')
       FROM item_tags it
       JOIN tags tg ON tg.id = it.tag_id
       WHERE (it.target_type = 'host' AND it.target_id = h.id)
          OR (it.target_type = 'port' AND it.target_id IN (SELECT id FROM ports WHERE host_id = h.id))
      ) AS host_tags,
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
      (SELECT trim((regexp_matches(e.caption, 'Page title: ([^[]+)'))[1])
       FROM evidence e
       WHERE e.port_id = p.id AND e.source = 'gowitness' AND e.caption LIKE 'Page title:%%'
       ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
       LIMIT 1) AS latest_http_title,
      (SELECT trim((regexp_matches(e.caption, 'Server: ([^[]+)'))[1])
       FROM evidence e
       WHERE e.port_id = p.id AND e.source = 'gowitness' AND e.caption LIKE 'Server:%%'
       ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
       LIMIT 1) AS latest_http_server,
      (SELECT (regexp_matches(e.caption, 'Response code: ([0-9]+)'))[1]::int
       FROM evidence e
       WHERE e.port_id = p.id AND e.source = 'gowitness' AND e.caption LIKE 'Response code:%%'
       ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
       LIMIT 1) AS latest_http_status_code,
      (SELECT trim((regexp_matches(e.caption, 'Technologies: ([^[]+)'))[1])
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
    op.execute("""
    CREATE VIEW service_current AS
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
      (SELECT trim((regexp_matches(e.caption, 'Page title: ([^[]+)'))[1])
       FROM evidence e
       WHERE e.port_id = p.id AND e.source = 'gowitness' AND e.caption LIKE 'Page title:%%'
       ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
       LIMIT 1) AS latest_http_title,
      (SELECT trim((regexp_matches(e.caption, 'Server: ([^[]+)'))[1])
       FROM evidence e
       WHERE e.port_id = p.id AND e.source = 'gowitness' AND e.caption LIKE 'Server:%%'
       ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
       LIMIT 1) AS latest_http_server,
      (SELECT (regexp_matches(e.caption, 'Response code: ([0-9]+)'))[1]::int
       FROM evidence e
       WHERE e.port_id = p.id AND e.source = 'gowitness' AND e.caption LIKE 'Response code:%%'
       ORDER BY e.imported_at DESC NULLS LAST, e.created_at DESC NULLS LAST
       LIMIT 1) AS latest_http_status_code,
      (SELECT trim((regexp_matches(e.caption, 'Technologies: ([^[]+)'))[1])
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
