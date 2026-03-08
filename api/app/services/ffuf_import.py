"""
FFuf directory/file fuzzing import: create/find host and port, add parent Evidence
"Web Directories" and child Evidence per path with caption "{full_url} [ffuf]".
"""
from __future__ import annotations

import ipaddress
from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.models import Evidence, Host, Port, Project
from app.services.audit import log_audit
from app.services.ffuf_parser import (
    FFUF_SOURCE,
    FfufParseResult,
    parse_ffuf,
)
from app.services.subnet import find_or_create_subnet_for_ip

UNRESOLVED_IP = "unresolved"


def _is_ip(host: str) -> bool:
    """Return True if host string is an IP address."""
    host = (host or "").strip()
    if not host:
        return False
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def _find_or_create_host(
    db: Session,
    project_id: UUID,
    host_str: str,
    port_num: int,
) -> tuple[Host, bool]:
    """Find or create host. host_str can be IP or hostname. Returns (host, created)."""
    host_str = (host_str or "").strip()
    if not host_str:
        raise ValueError("FFuf parse result has no host")

    if _is_ip(host_str):
        ip = host_str
        dns_name = None
        subnet_id = find_or_create_subnet_for_ip(db, project_id, ip)
    else:
        ip = UNRESOLVED_IP
        dns_name = host_str
        subnet_id = None

    q = db.query(Host).filter(Host.project_id == project_id)
    if ip != UNRESOLVED_IP:
        existing = q.filter(Host.ip == ip).first()
        if not existing and dns_name:
            existing = q.filter(Host.ip == UNRESOLVED_IP, Host.dns_name == dns_name).first()
    else:
        existing = q.filter(Host.ip == UNRESOLVED_IP, Host.dns_name == dns_name).first()

    if existing:
        return existing, False

    host = Host(
        project_id=project_id,
        subnet_id=subnet_id,
        ip=ip,
        dns_name=dns_name,
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
    scheme: str,
) -> tuple[Port, bool]:
    """Find or create TCP port. Returns (port, created)."""
    existing = (
        db.query(Port)
        .filter(Port.host_id == host.id, Port.protocol == "tcp", Port.number == port_num)
        .first()
    )
    if existing:
        return existing, False

    port = Port(
        host_id=host.id,
        protocol="tcp",
        number=port_num,
        state="open",
        service_name="http" if scheme == "http" else "https",
        discovered_by=FFUF_SOURCE,
    )
    db.add(port)
    db.commit()
    db.refresh(port)
    return port, True


def _build_parent_notes_md(parse_result: FfufParseResult) -> str:
    """Build markdown for parent Evidence: command, date/time, and paths table."""
    parts = []
    if parse_result.command:
        parts.append(f"**Command:** `{parse_result.command}`")
    if parse_result.started_at:
        parts.append(f"**Started:** {parse_result.started_at}")
    if parts:
        parts.append("")
    parts.append("| Path | Status | Size |")
    parts.append("|------|--------|------|")
    for p in parse_result.paths:
        size_str = str(p.size) if p.size is not None else "—"
        parts.append(f"| {p.path} | {p.status} | {size_str} |")
    return "\n".join(parts)


def run_ffuf_import(
    db: Session,
    project_id: UUID,
    content: bytes,
    filename: str,
    user_id: UUID,
    request_ip: str | None = None,
) -> dict:
    """
    Parse FFuf output and create parent "Web Directories" Evidence and
    one child Evidence per path with caption "{full_url} [ffuf]".
    Returns summary dict.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return {
            "format": "ffuf",
            "hosts_created": 0,
            "ports_created": 0,
            "evidence_created": 0,
            "errors": ["Project not found"],
        }

    parse_result = parse_ffuf(content, filename)
    if parse_result.errors and not parse_result.paths and not parse_result.base_url:
        return {
            "format": "ffuf",
            "hosts_created": 0,
            "ports_created": 0,
            "evidence_created": 0,
            "errors": parse_result.errors,
        }

    if not parse_result.host:
        return {
            "format": "ffuf",
            "hosts_created": 0,
            "ports_created": 0,
            "evidence_created": 0,
            "errors": parse_result.errors or ["Could not determine host from URL"],
        }

    parsed_url = urlparse(parse_result.base_url)
    scheme = parsed_url.scheme or "http"

    try:
        host, host_created = _find_or_create_host(
            db, project_id, parse_result.host, parse_result.port
        )
    except ValueError as e:
        return {
            "format": "ffuf",
            "hosts_created": 0,
            "ports_created": 0,
            "evidence_created": 0,
            "errors": [str(e)],
        }

    port, port_created = _find_or_create_port(db, host, parse_result.port, scheme)
    imported_at = datetime.now(timezone.utc)

    # Parent Evidence: "Web Directories", no tool name in caption
    parent_notes = _build_parent_notes_md(parse_result)
    parent_ev = Evidence(
        project_id=project_id,
        host_id=host.id,
        port_id=port.id,
        filename="Web Directories",
        caption="Web Directories",
        stored_path=None,
        is_pasted=True,
        mime=None,
        size=None,
        source=FFUF_SOURCE,
        imported_at=imported_at,
        source_file=filename,
        notes_md=parent_notes,
        parent_evidence_id=None,
    )
    db.add(parent_ev)
    db.commit()
    db.refresh(parent_ev)

    # Child Evidence per path: caption = "{full_url} [ffuf]"
    for p in parse_result.paths:
        child_caption = f"{p.full_url} [ffuf]"
        child_notes = f"Status: {p.status}" + (f" | Size: {p.size}" if p.size is not None else "")
        child_ev = Evidence(
            project_id=project_id,
            host_id=host.id,
            port_id=port.id,
            filename=child_caption,
            caption=child_caption,
            stored_path=None,
            is_pasted=True,
            mime=None,
            size=None,
            source=FFUF_SOURCE,
            imported_at=imported_at,
            source_file=filename,
            notes_md=child_notes,
            parent_evidence_id=parent_ev.id,
        )
        db.add(child_ev)
    db.commit()

    log_audit(
        db,
        project_id=project_id,
        user_id=user_id,
        action_type="ffuf_import_completed",
        record_type="project",
        record_id=project_id,
        after_json={
            "source_file": filename,
            "hosts_created": 1 if host_created else 0,
            "ports_created": 1 if port_created else 0,
            "evidence_created": 1 + len(parse_result.paths),
        },
        ip_address=request_ip,
    )
    db.commit()

    return {
        "format": "ffuf",
        "hosts_created": 1 if host_created else 0,
        "ports_created": 1 if port_created else 0,
        "evidence_created": 1 + len(parse_result.paths),
        "errors": parse_result.errors,
    }
