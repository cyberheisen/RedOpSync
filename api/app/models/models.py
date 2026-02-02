import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    String,
    Text,
    Integer,
    DateTime,
    ForeignKey,
    Enum as SQLEnum,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship

from app.db.base import Base


def uuid_default():
    return uuid.uuid4()


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    username = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(SQLEnum("user", "admin", name="user_role"), nullable=False, default="user")
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    disabled_at = Column(DateTime(timezone=True), nullable=True)


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    countdown_red_days_default = Column(Integer, nullable=False, default=7)
    scope_policy = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    subnets = relationship("Subnet", back_populates="project", cascade="all, delete-orphan")
    hosts = relationship("Host", back_populates="project", cascade="all, delete-orphan")


class Subnet(Base):
    __tablename__ = "subnets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    cidr = Column(String(64), nullable=False)
    name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    project = relationship("Project", back_populates="subnets")
    hosts = relationship("Host", back_populates="subnet", cascade="all, delete-orphan")


class Host(Base):
    __tablename__ = "hosts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    subnet_id = Column(UUID(as_uuid=True), ForeignKey("subnets.id", ondelete="SET NULL"), nullable=True, index=True)
    ip = Column(String(45), nullable=False)
    dns_name = Column(String(255), nullable=True)
    tags = Column(ARRAY(String), nullable=True, default=list)
    status = Column(String(64), nullable=True, default="unknown")
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="hosts")
    subnet = relationship("Subnet", back_populates="hosts")
    ports = relationship("Port", back_populates="host", cascade="all, delete-orphan")


class Port(Base):
    __tablename__ = "ports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    host_id = Column(UUID(as_uuid=True), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False, index=True)
    protocol = Column(SQLEnum("tcp", "udp", name="port_protocol"), nullable=False)
    number = Column(Integer, nullable=False)
    state = Column(String(32), nullable=True)
    service_name = Column(String(255), nullable=True)
    service_version = Column(String(255), nullable=True)
    banner = Column(Text, nullable=True)
    description_md = Column(Text, nullable=True)
    evidence_md = Column(Text, nullable=True)
    discovered_by = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    host = relationship("Host", back_populates="ports")

    __table_args__ = (
        UniqueConstraint("host_id", "protocol", "number", name="uq_host_protocol_number"),
    )


class Application(Base):
    __tablename__ = "applications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    host_id = Column(UUID(as_uuid=True), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False, index=True)
    port_id = Column(UUID(as_uuid=True), ForeignKey("ports.id", ondelete="SET NULL"), nullable=True, index=True)
    type = Column(String(64), nullable=True)
    url = Column(Text, nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class VulnerabilitySubnetAssociation(Base):
    __tablename__ = "vulnerability_subnet_associations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    vulnerability_definition_id = Column(
        UUID(as_uuid=True), ForeignKey("vulnerability_definitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subnet_id = Column(UUID(as_uuid=True), ForeignKey("subnets.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    definition = relationship("VulnerabilityDefinition", backref="subnet_associations")
    subnet = relationship("Subnet", backref="vulnerability_associations")

    __table_args__ = (UniqueConstraint("vulnerability_definition_id", "subnet_id", name="uq_vuln_def_subnet"),)


class VulnerabilityAttachment(Base):
    __tablename__ = "vulnerability_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    vulnerability_definition_id = Column(
        UUID(as_uuid=True), ForeignKey("vulnerability_definitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename = Column(String(512), nullable=False)
    mime = Column(String(128), nullable=True)
    size = Column(Integer, nullable=True)
    stored_path = Column(String(1024), nullable=False)
    uploaded_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_pasted = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    definition = relationship("VulnerabilityDefinition", backref="attachments")
    uploaded_by = relationship("User", backref="vulnerability_attachments")


class VulnerabilityDefinition(Base):
    __tablename__ = "vulnerability_definitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(512), nullable=False)
    description_md = Column(Text, nullable=True)
    remediation_md = Column(Text, nullable=True)
    evidence_md = Column(Text, nullable=True)
    cvss_vector = Column(String(255), nullable=True)
    cvss_score = Column(Integer, nullable=True)
    severity = Column(String(32), nullable=True)
    cve_ids = Column(ARRAY(String), nullable=True, default=list)
    references = Column(ARRAY(Text), nullable=True, default=list)
    discovered_by = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class VulnerabilityInstance(Base):
    __tablename__ = "vulnerability_instances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    vulnerability_definition_id = Column(
        UUID(as_uuid=True), ForeignKey("vulnerability_definitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    host_id = Column(UUID(as_uuid=True), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False, index=True)
    port_id = Column(UUID(as_uuid=True), ForeignKey("ports.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(
        SQLEnum("open", "accepted_risk", "closed", name="vuln_instance_status"), nullable=False, default="open"
    )
    notes_md = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    definition = relationship("VulnerabilityDefinition", backref="instances")
    host = relationship("Host", backref="vulnerability_instances")


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    host_id = Column(UUID(as_uuid=True), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=True, index=True)
    port_id = Column(UUID(as_uuid=True), ForeignKey("ports.id", ondelete="SET NULL"), nullable=True, index=True)
    vuln_instance_id = Column(
        UUID(as_uuid=True), ForeignKey("vulnerability_instances.id", ondelete="SET NULL"), nullable=True, index=True
    )
    filename = Column(String(512), nullable=False)
    mime = Column(String(128), nullable=True)
    size = Column(Integer, nullable=True)
    sha256 = Column(String(64), nullable=True)
    caption = Column(Text, nullable=True)
    stored_path = Column(String(1024), nullable=True)
    is_pasted = Column(Boolean, nullable=False, default=False)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    thumbnail_path = Column(String(1024), nullable=True)

    uploaded_by = relationship("User", backref="evidence")


class Note(Base):
    __tablename__ = "notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    host_id = Column(UUID(as_uuid=True), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=True, index=True)
    port_id = Column(UUID(as_uuid=True), ForeignKey("ports.id", ondelete="SET NULL"), nullable=True, index=True)
    vuln_instance_id = Column(
        UUID(as_uuid=True), ForeignKey("vulnerability_instances.id", ondelete="SET NULL"), nullable=True, index=True
    )
    body_md = Column(Text, nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class Lock(Base):
    __tablename__ = "locks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    project = relationship("Project", backref="locks", passive_deletes=True)
    record_type = Column(String(64), nullable=False)
    record_id = Column(UUID(as_uuid=True), nullable=False)
    locked_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    locked_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    locked_by = relationship("User", backref="locks")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action_type = Column(String(64), nullable=False)
    record_type = Column(String(64), nullable=True)
    record_id = Column(UUID(as_uuid=True), nullable=True)
    before_json = Column(JSONB, nullable=True)
    after_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)


class ImportExportJob(Base):
    __tablename__ = "import_export_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    type = Column(String(32), nullable=False)  # import | export
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    filename = Column(String(512), nullable=True)
    status = Column(String(32), nullable=False, default="pending")  # pending, in_progress, completed, failed
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)
    last_activity = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid_default)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(64), nullable=False)
    target_ref = Column(JSONB, nullable=True)
    status = Column(String(32), nullable=False, default="pending")
    requested_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    parameters = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    logs_text = Column(Text, nullable=True)
    raw_artifact_paths = Column(ARRAY(Text), nullable=True, default=list)
    error_text = Column(Text, nullable=True)
