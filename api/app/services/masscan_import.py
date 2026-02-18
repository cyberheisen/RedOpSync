"""
Masscan import: ingest Masscan list output and populate Hosts, Ports.

- Creates/merges hosts by IP; ports keyed by (port, protocol)
- discovered_by=masscan, source_file, imported_at on all imported data
- Never overwrite manual data; same-source (masscan) may update state
- List format: status protocol port ip timestamp (last column = timestamp)
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.models import Host, Port, Project
from app.services.audit import log_audit
from app.services.masscan_parser import MASSCAN_SOURCE, MasscanHost, MasscanParseResult
from app.services.subnet import find_or_create_subnet_for_ip


class MasscanImportSummary:
    """Structured import summary for Masscan."""

    def __init__(
        self,
        *,
        hosts_created: int = 0,
        hosts_updated: int = 0,
        ports_created: int = 0,
        ports_updated: int = 0,
        errors: list[str] | None = None,
    ):
        self.hosts_created = hosts_created
        self.hosts_updated = hosts_updated
        self.ports_created = ports_created
        self.ports_updated = ports_updated
        self.errors = errors or []


def _find_or_create_host(
    db: Session,
    project_id: UUID,
    mh: MasscanHost,
    imported_at: datetime,
) -> tuple[Host, bool]:
    """Find or create host by project_id and IP. Returns (host, created)."""
    ip = (mh.ip or "").strip()
    if not ip:
        raise ValueError("Masscan host has no IP")

    existing = (
        db.query(Host)
        .filter(Host.project_id == project_id, Host.ip == ip)
        .first()
    )

    if existing:
        if existing.status in (None, "unknown"):
            existing.status = "online"
            db.commit()
            db.refresh(existing)
        return existing, False

    subnet_id = find_or_create_subnet_for_ip(db, project_id, ip)
    host = Host(
        project_id=project_id,
        subnet_id=subnet_id,
        ip=ip,
        dns_name=None,
        status="online",
    )
    db.add(host)
    db.commit()
    db.refresh(host)
    return host, True


def _find_or_create_port(
    db: Session,
    host: Host,
    port_id: int,
    protocol: str,
    state: str,
    scanned_at: datetime | None = None,
) -> tuple[Port, bool]:
    """Find or create port. Returns (port, created)."""
    proto = (protocol or "tcp").lower()
    if proto not in ("tcp", "udp"):
        proto = "tcp"
    state = (state or "open")[:32]

    existing = (
        db.query(Port)
        .filter(Port.host_id == host.id, Port.protocol == proto, Port.number == port_id)
        .first()
    )

    if existing:
        is_same_source = (existing.discovered_by or "").lower() == MASSCAN_SOURCE
        state_updated = False
        if (not existing.state or is_same_source) and state:
            existing.state = state
            existing.discovered_by = MASSCAN_SOURCE
            state_updated = True
        if is_same_source and scanned_at is not None:
            existing.scanned_at = scanned_at
        if state_updated or (is_same_source and scanned_at is not None):
            db.commit()
            db.refresh(existing)
        return existing, False

    port = Port(
        host_id=host.id,
        protocol=proto,
        number=port_id,
        state=state,
        service_name=None,
        service_version=None,
        banner=None,
        discovered_by=MASSCAN_SOURCE,
        scanned_at=scanned_at,
    )
    db.add(port)
    db.commit()
    db.refresh(port)
    return port, True


def run_masscan_import(
    db: Session,
    project_id: UUID,
    parse_result: MasscanParseResult,
    user_id: UUID,
    request_ip: str | None = None,
) -> MasscanImportSummary:
    """
    Import Masscan parse result into project. Creates/merges hosts and ports.

    Returns MasscanImportSummary.
    """
    summary = MasscanImportSummary()
    source_file = parse_result.source_file or "masscan-import"
    imported_at = datetime.now(timezone.utc)

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        summary.errors.append("Project not found")
        return summary

    summary.errors.extend(parse_result.errors)

    log_audit(
        db,
        project_id=project_id,
        user_id=user_id,
        action_type="masscan_import_started",
        record_type="project",
        record_id=project_id,
        after_json={
            "source_file": source_file,
            "host_count": len(parse_result.hosts),
            "import_source": "masscan",
        },
        ip_address=request_ip,
    )
    db.commit()

    for mh in parse_result.hosts:
        try:
            host, host_created = _find_or_create_host(db, project_id, mh, imported_at)
            if host_created:
                summary.hosts_created += 1
                log_audit(
                    db,
                    project_id=project_id,
                    user_id=user_id,
                    action_type="masscan_host_created",
                    record_type="host",
                    record_id=host.id,
                    after_json={"ip": host.ip},
                    ip_address=request_ip,
                )
            else:
                summary.hosts_updated += 1

            for mp in mh.ports:
                try:
                    scanned_at = (
                        datetime.fromtimestamp(mp.timestamp, tz=timezone.utc)
                        if mp.timestamp is not None
                        else None
                    )
                    port, port_created = _find_or_create_port(
                        db, host, mp.port_id, mp.protocol, mp.state, scanned_at=scanned_at
                    )
                    if port_created:
                        summary.ports_created += 1
                        log_audit(
                            db,
                            project_id=project_id,
                            user_id=user_id,
                            action_type="masscan_port_created",
                            record_type="port",
                            record_id=port.id,
                            after_json={"number": port.number, "protocol": port.protocol},
                            ip_address=request_ip,
                        )
                    else:
                        summary.ports_updated += 1
                except Exception as e:
                    summary.errors.append(f"Port {mp.port_id}/{mp.protocol}: {e}")
        except Exception as e:
            summary.errors.append(f"Host {mh.ip}: {e}")

    log_audit(
        db,
        project_id=project_id,
        user_id=user_id,
        action_type="masscan_import_completed",
        record_type="project",
        record_id=project_id,
        after_json={
            "source_file": source_file,
            "hosts_created": summary.hosts_created,
            "hosts_updated": summary.hosts_updated,
            "ports_created": summary.ports_created,
            "ports_updated": summary.ports_updated,
            "errors_count": len(summary.errors),
        },
        ip_address=request_ip,
    )
    db.commit()

    return summary
