"""
GoWitness import orchestrator: parse output, create/find hosts and ports, attach evidence.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import shutil
import uuid as uuid_mod
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import Evidence, Host, Port, Project
from app.services.audit import log_audit
from app.services.subnet import find_or_create_subnet_for_ip
from app.services.timestamp_normalizer import normalize_timestamp_to_iso8601
from app.services.gowitness_parser import (
    GOWITNESS_SOURCE,
    GoWitnessRecord,
    ParseResult,
    parse_gowitness_directory,
)

UNRESOLVED_IP = "unresolved"


@dataclass
class ImportSummary:
    """Summary of GoWitness import results."""

    hosts_created: int = 0
    ports_created: int = 0
    screenshots_imported: int = 0
    metadata_records_imported: int = 0
    errors: list[str] = field(default_factory=list)
    skipped: int = 0


def _screenshot_evidence_exists(db: Session, port_id: UUID, file_sha256: str | None) -> bool:
    """Check if screenshot with same SHA256 from gowitness already exists for port."""
    if not file_sha256:
        return False
    return (
        db.query(Evidence)
        .filter(
            Evidence.port_id == port_id,
            Evidence.source == GOWITNESS_SOURCE,
            Evidence.sha256 == file_sha256,
        )
        .first()
        is not None
    )


def _metadata_evidence_exists(db: Session, port_id: UUID, ev_type: str, value: str) -> bool:
    """Check if metadata evidence of this type+value from gowitness exists for port."""
    prefix = {
        "response_code": "Response code: ",
        "server": "Server: ",
        "technologies": "Technologies: ",
        "title": "Page title: ",
        "redirect_chain": "Redirect chain: ",
    }.get(ev_type, "")
    search = f"{prefix}{value}"
    q = (
        db.query(Evidence)
        .filter(
            Evidence.port_id == port_id,
            Evidence.source == GOWITNESS_SOURCE,
            Evidence.stored_path.is_(None),
        )
    )
    for ev in q:
        if ev.caption and search in ev.caption:
            return True
    return False


def _find_or_create_host(
    db: Session,
    project_id: UUID,
    parsed,
    source_dir: str,
) -> tuple[Host, bool]:
    """Find or create host. Match by (project_id, ip, dns_name) for resolved so same IP with different hostname creates a new host. Returns (host, created)."""
    ip = parsed.host if parsed.is_ip else UNRESOLVED_IP
    dns = parsed.hostname if parsed.is_ip else parsed.host
    dns_norm = (dns or "").strip() or None

    q = db.query(Host).filter(Host.project_id == project_id)
    if parsed.is_ip:
        q_ip = q.filter(Host.ip == ip)
        if dns_norm:
            existing = q_ip.filter(Host.dns_name == dns_norm).first()
        else:
            existing = q_ip.filter(or_(Host.dns_name.is_(None), Host.dns_name == "")).first()
        if existing is None and dns_norm:
            existing = q.filter(Host.ip == UNRESOLVED_IP, Host.dns_name == dns_norm).first()
    else:
        existing = q.filter(Host.dns_name == dns).first()
        if not existing:
            existing = db.query(Host).filter(
                Host.project_id == project_id,
                Host.ip == UNRESOLVED_IP,
                Host.dns_name == dns,
            ).first()
    if existing:
        need_update = False
        if parsed.is_ip and dns and (not existing.dns_name or existing.dns_name != dns):
            existing.dns_name = dns
            need_update = True
        if parsed.is_ip and existing.ip == UNRESOLVED_IP:
            existing.ip = ip
            new_subnet = find_or_create_subnet_for_ip(db, project_id, ip)
            if new_subnet:
                existing.subnet_id = new_subnet
            existing.status = "unknown"
            need_update = True
        if not parsed.is_ip and existing.ip == UNRESOLVED_IP and parsed.host:
            existing.ip = UNRESOLVED_IP
            if not existing.dns_name:
                existing.dns_name = parsed.host
            need_update = True
        if need_update:
            db.commit()
        return existing, False

    subnet_id = find_or_create_subnet_for_ip(db, project_id, ip) if parsed.is_ip else None

    host = Host(
        project_id=project_id,
        subnet_id=subnet_id,
        ip=ip,
        dns_name=dns,
        status="unknown",
    )
    db.add(host)
    db.commit()
    db.refresh(host)
    return host, True


def _find_or_create_port(
    db: Session,
    host: Host,
    port_num: int,
    protocol: str,
) -> tuple[Port, bool]:
    """Find or create port. Returns (port, created)."""
    proto = "tcp"
    existing = (
        db.query(Port)
        .filter(Port.host_id == host.id, Port.protocol == proto, Port.number == port_num)
        .first()
    )
    if existing:
        return existing, False

    port = Port(
        host_id=host.id,
        protocol=proto,
        number=port_num,
        state="open",
        service_name="http" if protocol == "http" else "https",
        discovered_by=GOWITNESS_SOURCE,
    )
    db.add(port)
    db.commit()
    db.refresh(port)
    return port, True


def _add_evidence(
    db: Session,
    project_id: UUID,
    host_id: UUID,
    port_id: UUID,
    caption: str,
    stored_path: str | None,
    filename: str,
    mime: str | None,
    size: int | None,
    sha256: str | None,
    source_dir: str,
    imported_at: datetime,
    source_timestamp: str | None = None,
) -> bool:
    """Add evidence if not duplicate. Returns True if added."""
    ev = Evidence(
        project_id=project_id,
        host_id=host_id,
        port_id=port_id,
        filename=filename,
        caption=caption,
        mime=mime,
        size=size,
        sha256=sha256,
        stored_path=stored_path,
        is_pasted=False,
        source=GOWITNESS_SOURCE,
        imported_at=imported_at,
        source_file=source_dir,
        source_timestamp=source_timestamp,
    )
    db.add(ev)
    db.commit()
    return True


def run_gowitness_import(
    db: Session,
    project_id: UUID,
    root_path: Path,
    user_id: UUID,
    request_ip: str | None = None,
) -> ImportSummary:
    """
    Run GoWitness import for a mission.

    - Parses directory
    - Creates hosts/ports as needed
    - Attaches screenshots and metadata as Evidence
    - Never overwrites user evidence
    - Marks host ONLINE when screenshot captured
    """
    import hashlib

    summary = ImportSummary()
    imported_at = datetime.now(timezone.utc)
    source_dir = root_path.name or str(root_path)
    base_dir = Path(settings.attachments_dir or "/tmp").joinpath("evidence", "gowitness")
    base_dir.mkdir(parents=True, exist_ok=True)

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        summary.errors.append("Project not found")
        return summary

    log_audit(
        db,
        project_id=project_id,
        user_id=user_id,
        action_type="gowitness_import_started",
        record_type="project",
        record_id=project_id,
        after_json={"source_dir": source_dir},
        ip_address=request_ip,
    )
    db.commit()

    result = parse_gowitness_directory(root_path)
    summary.errors.extend(result.errors)

    if not result.records:
        return summary

    for rec in result.records:
        try:
            parsed = rec.parsed
            if not parsed:
                summary.skipped += 1
                continue

            host, host_created = _find_or_create_host(db, project_id, parsed, source_dir)
            if host_created:
                summary.hosts_created += 1
                log_audit(
                    db,
                    project_id=project_id,
                    user_id=user_id,
                    action_type="gowitness_host_created",
                    record_type="host",
                    record_id=host.id,
                    after_json={"ip": host.ip, "dns_name": host.dns_name},
                    ip_address=request_ip,
                )

            port, port_created = _find_or_create_port(
                db, host, parsed.port, parsed.protocol
            )
            if port_created:
                summary.ports_created += 1
                log_audit(
                    db,
                    project_id=project_id,
                    user_id=user_id,
                    action_type="gowitness_port_created",
                    record_type="port",
                    record_id=port.id,
                    after_json={"number": port.number, "protocol": port.protocol},
                    ip_address=request_ip,
                )

            ev_base = base_dir / str(port.id)
            ev_base.mkdir(parents=True, exist_ok=True)

            if rec.screenshot_path and rec.screenshot_path.is_file():
                screenshot_title = rec.title or rec.url or rec.screenshot_path.stem
                if not screenshot_title and rec.url:
                    from urllib.parse import urlparse

                    u = urlparse(rec.url)
                    screenshot_title = u.path or "/"
                screenshot_caption = f"Screenshot: {screenshot_title} [{GOWITNESS_SOURCE}]"
                try:
                    file_hash = hashlib.sha256(rec.screenshot_path.read_bytes()).hexdigest()
                except Exception:
                    file_hash = None
                mime = "image/png" if rec.screenshot_path.suffix.lower() == ".png" else "image/jpeg"
                if not _screenshot_evidence_exists(db, port.id, file_hash):
                    dest_name = f"{uuid_mod.uuid4().hex}{rec.screenshot_path.suffix}"
                    dest_path = ev_base / dest_name
                    try:
                        shutil.copy2(rec.screenshot_path, dest_path)
                        size = dest_path.stat().st_size
                        if _add_evidence(
                            db,
                            project_id,
                            host.id,
                            port.id,
                            screenshot_caption,
                            str(dest_path),
                            rec.screenshot_path.name,
                            mime,
                            size,
                            file_hash,
                            source_dir,
                            imported_at,
                            source_timestamp=normalize_timestamp_to_iso8601(rec.probed_at),
                        ):
                            summary.screenshots_imported += 1
                            host.status = "online"
                            db.commit()
                    except Exception as e:
                        summary.errors.append(f"Screenshot copy failed {rec.screenshot_path.name}: {e}")
                else:
                    summary.skipped += 1

            if rec.response_code is not None:
                cap = f"Response code: {rec.response_code} [{GOWITNESS_SOURCE}]"
                if not _metadata_evidence_exists(db, port.id, "response_code", str(rec.response_code)):
                    if _add_evidence(
                        db,
                        project_id,
                        host.id,
                        port.id,
                        cap,
                        None,
                        f"metadata-response-{rec.response_code}",
                        None,
                        None,
                        None,
                        source_dir,
                        imported_at,
                        source_timestamp=normalize_timestamp_to_iso8601(rec.probed_at),
                    ):
                        summary.metadata_records_imported += 1

            if rec.server_header:
                cap = f"Server: {rec.server_header} [{GOWITNESS_SOURCE}]"
                if not _metadata_evidence_exists(db, port.id, "server", rec.server_header):
                    if _add_evidence(
                        db,
                        project_id,
                        host.id,
                        port.id,
                        cap,
                        None,
                        "metadata-server",
                        None,
                        None,
                        None,
                        source_dir,
                        imported_at,
                        source_timestamp=normalize_timestamp_to_iso8601(rec.probed_at),
                    ):
                        summary.metadata_records_imported += 1

            if rec.technologies:
                tech_str = ", ".join(rec.technologies)
                cap = f"Technologies: {tech_str} [{GOWITNESS_SOURCE}]"
                if not _metadata_evidence_exists(db, port.id, "technologies", tech_str):
                    if _add_evidence(
                        db,
                        project_id,
                        host.id,
                        port.id,
                        cap,
                        None,
                        "metadata-technologies",
                        None,
                        None,
                        None,
                        source_dir,
                        imported_at,
                        source_timestamp=normalize_timestamp_to_iso8601(rec.probed_at),
                    ):
                        summary.metadata_records_imported += 1

            if rec.title:
                cap = f"Page title: {rec.title} [{GOWITNESS_SOURCE}]"
                if not _metadata_evidence_exists(db, port.id, "title", rec.title):
                    if _add_evidence(
                        db,
                        project_id,
                        host.id,
                        port.id,
                        cap,
                        None,
                        "metadata-title",
                        None,
                        None,
                        None,
                        source_dir,
                        imported_at,
                        source_timestamp=normalize_timestamp_to_iso8601(rec.probed_at),
                    ):
                        summary.metadata_records_imported += 1

            if rec.redirect_chain:
                redirect_str = " -> ".join(rec.redirect_chain)
                cap = f"Redirect chain: {redirect_str} [{GOWITNESS_SOURCE}]"
                if not _metadata_evidence_exists(db, port.id, "redirect_chain", redirect_str):
                    if _add_evidence(
                        db,
                        project_id,
                        host.id,
                        port.id,
                        cap,
                        None,
                        "metadata-redirects",
                        None,
                        None,
                        None,
                        source_dir,
                        imported_at,
                        source_timestamp=normalize_timestamp_to_iso8601(rec.probed_at),
                    ):
                        summary.metadata_records_imported += 1

        except Exception as e:
            summary.errors.append(f"Record error: {e}")

    log_audit(
        db,
        project_id=project_id,
        user_id=user_id,
        action_type="gowitness_import_completed",
        record_type="project",
        record_id=project_id,
        after_json={
            "hosts_created": summary.hosts_created,
            "ports_created": summary.ports_created,
            "screenshots": summary.screenshots_imported,
            "metadata": summary.metadata_records_imported,
            "errors": len(summary.errors),
        },
        ip_address=request_ip,
    )
    db.commit()
    return summary
