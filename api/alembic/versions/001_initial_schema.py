"""initial_schema

Revision ID: 001
Revises:
Create Date: 2025-01-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE user_role AS ENUM ('user', 'admin')")
    op.execute("CREATE TYPE port_protocol AS ENUM ('tcp', 'udp')")
    op.execute("CREATE TYPE vuln_instance_status AS ENUM ('open', 'accepted_risk', 'closed')")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", postgresql.ENUM("user", "admin", name="user_role", create_type=False), nullable=False, server_default="user"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("countdown_red_days_default", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("scope_policy", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "subnets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cidr", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_subnets_project_id", "subnets", ["project_id"], unique=False)

    op.create_table(
        "hosts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subnet_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subnets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ip", sa.String(45), nullable=False),
        sa.Column("dns_name", sa.String(255), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("status", sa.String(64), nullable=True, server_default="unknown"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_hosts_project_id", "hosts", ["project_id"], unique=False)
    op.create_index("ix_hosts_subnet_id", "hosts", ["subnet_id"], unique=False)

    op.create_table(
        "ports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("host_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("protocol", postgresql.ENUM("tcp", "udp", name="port_protocol", create_type=False), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(32), nullable=True),
        sa.Column("service_name", sa.String(255), nullable=True),
        sa.Column("service_version", sa.String(255), nullable=True),
        sa.Column("banner", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("host_id", "protocol", "number", name="uq_host_protocol_number"),
    )
    op.create_index("ix_ports_host_id", "ports", ["host_id"], unique=False)

    op.create_table(
        "applications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("host_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("port_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("type", sa.String(64), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_applications_host_id", "applications", ["host_id"], unique=False)
    op.create_index("ix_applications_port_id", "applications", ["port_id"], unique=False)

    op.create_table(
        "vulnerability_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("description_md", sa.Text(), nullable=True),
        sa.Column("remediation_md", sa.Text(), nullable=True),
        sa.Column("cvss_vector", sa.String(255), nullable=True),
        sa.Column("cvss_score", sa.Integer(), nullable=True),
        sa.Column("severity", sa.String(32), nullable=True),
        sa.Column("references", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_vulnerability_definitions_project_id", "vulnerability_definitions", ["project_id"], unique=False)

    op.create_table(
        "vulnerability_instances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vulnerability_definition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vulnerability_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("host_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("port_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", postgresql.ENUM("open", "accepted_risk", "closed", name="vuln_instance_status", create_type=False), nullable=False, server_default="open"),
        sa.Column("notes_md", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_vulnerability_instances_project_id", "vulnerability_instances", ["project_id"], unique=False)
    op.create_index("ix_vulnerability_instances_vulnerability_definition_id", "vulnerability_instances", ["vulnerability_definition_id"], unique=False)
    op.create_index("ix_vulnerability_instances_host_id", "vulnerability_instances", ["host_id"], unique=False)
    op.create_index("ix_vulnerability_instances_port_id", "vulnerability_instances", ["port_id"], unique=False)

    op.create_table(
        "evidence",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("host_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosts.id", ondelete="CASCADE"), nullable=True),
        sa.Column("port_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vuln_instance_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vulnerability_instances.id", ondelete="SET NULL"), nullable=True),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("mime", sa.String(128), nullable=True),
        sa.Column("size", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("thumbnail_path", sa.String(1024), nullable=True),
    )
    op.create_index("ix_evidence_project_id", "evidence", ["project_id"], unique=False)
    op.create_index("ix_evidence_host_id", "evidence", ["host_id"], unique=False)
    op.create_index("ix_evidence_port_id", "evidence", ["port_id"], unique=False)
    op.create_index("ix_evidence_vuln_instance_id", "evidence", ["vuln_instance_id"], unique=False)

    op.create_table(
        "notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("host_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosts.id", ondelete="CASCADE"), nullable=True),
        sa.Column("port_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vuln_instance_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vulnerability_instances.id", ondelete="SET NULL"), nullable=True),
        sa.Column("body_md", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_notes_project_id", "notes", ["project_id"], unique=False)
    op.create_index("ix_notes_host_id", "notes", ["host_id"], unique=False)
    op.create_index("ix_notes_port_id", "notes", ["port_id"], unique=False)
    op.create_index("ix_notes_vuln_instance_id", "notes", ["vuln_instance_id"], unique=False)

    op.create_table(
        "locks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("record_type", sa.String(64), nullable=False),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("locked_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_locks_project_id", "locks", ["project_id"], unique=False)

    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action_type", sa.String(64), nullable=False),
        sa.Column("record_type", sa.String(64), nullable=True),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("before_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
    )
    op.create_index("ix_audit_events_project_id", "audit_events", ["project_id"], unique=False)
    op.create_index("ix_audit_events_user_id", "audit_events", ["user_id"], unique=False)
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"], unique=False)

    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("target_ref", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("requested_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("parameters", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("logs_text", sa.Text(), nullable=True),
        sa.Column("raw_artifact_paths", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("error_text", sa.Text(), nullable=True),
    )
    op.create_index("ix_jobs_project_id", "jobs", ["project_id"], unique=False)
    op.create_index("ix_jobs_status", "jobs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_table("jobs")
    op.drop_table("audit_events")
    op.drop_table("locks")
    op.drop_table("notes")
    op.drop_table("evidence")
    op.drop_table("vulnerability_instances")
    op.drop_table("vulnerability_definitions")
    op.drop_table("applications")
    op.drop_table("ports")
    op.drop_table("hosts")
    op.drop_table("subnets")
    op.drop_table("projects")
    op.drop_table("users")

    op.execute("DROP TYPE vuln_instance_status")
    op.execute("DROP TYPE port_protocol")
    op.execute("DROP TYPE user_role")
