"""
Plain text host import: one host per line.

Format: IP [hostname]
- Each non-empty line: optional hostname after whitespace
- Invalid IPs: skip and continue
- Same merge rules as Nmap (match by IP, update hostname)
- Subnets auto-create for valid IPs
- Source marker: text file import
"""
from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.models import Host
from app.services.audit import log_audit
from app.services.subnet import find_or_create_subnet_for_ip

TEXT_IMPORT_SOURCE = "text file import"


@dataclass
class TextHost:
    """Parsed host from text line."""

    ip: str
    hostname: str | None = None


@dataclass
class TextImportSummary:
    """Import summary for text file."""

    hosts_created: int = 0
    hosts_updated: int = 0
    errors: list[str] = field(default_factory=list)


def _is_valid_ip(ip_str: str) -> bool:
    """Check if string is a valid IPv4 or IPv6 address."""
    ip_str = (ip_str or "").strip()
    if not ip_str or ip_str.lower() == "unresolved":
        return False
    try:
        ipaddress.ip_address(ip_str)
        return True
    except ValueError:
        return False


def parse_text_hosts(content: bytes, filename: str) -> tuple[list[TextHost], list[str]]:
    """
    Parse plain text: one host per line. Format: IP [hostname]

    Returns (hosts, errors). Invalid lines are skipped; errors collected.
    """
    hosts: list[TextHost] = []
    errors: list[str] = []
    seen_ips: set[str] = set()

    try:
        text = content.decode("utf-8", errors="replace")
    except Exception as e:
        return [], [f"Could not decode file: {e}"]

    for i, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        ip = (parts[0] or "").strip()
        hostname = (parts[1].strip() or None) if len(parts) > 1 else None
        if not ip:
            continue
        if not _is_valid_ip(ip):
            errors.append(f"Line {i}: invalid IP '{ip}'")
            continue
        ip_normalized = str(ipaddress.ip_address(ip))
        if ip_normalized in seen_ips:
            continue
        seen_ips.add(ip_normalized)
        hosts.append(TextHost(ip=ip_normalized, hostname=hostname or None))

    return hosts, errors


def _find_or_create_host(
    db: Session,
    project_id: UUID,
    th: TextHost,
    source_file: str,
) -> tuple[Host, bool]:
    """Find or create host. Same merge rules as Nmap. Returns (host, created)."""
    ip = th.ip
    dns = th.hostname

    q = db.query(Host).filter(Host.project_id == project_id)
    existing = q.filter(Host.ip == ip).first()
    if not existing and dns:
        existing = q.filter(Host.dns_name == dns).first()

    if existing:
        need_update = False
        if dns and (not existing.dns_name or existing.dns_name != dns):
            existing.dns_name = dns
            need_update = True
        if need_update:
            db.commit()
            db.refresh(existing)
        return existing, False

    subnet_id = find_or_create_subnet_for_ip(db, project_id, ip)
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


def run_text_import(
    db: Session,
    project_id: UUID,
    content: bytes,
    filename: str,
    user_id: UUID,
    request_ip: str | None = None,
) -> TextImportSummary:
    """
    Import hosts from plain text file. One host per line: IP [hostname].
    Skips invalid lines; continues on errors.
    """
    summary = TextImportSummary()
    hosts, parse_errors = parse_text_hosts(content, filename)
    summary.errors.extend(parse_errors)

    source_file = filename or "text-import"

    log_audit(
        db,
        project_id=project_id,
        user_id=user_id,
        action_type="text_import_started",
        record_type="project",
        record_id=project_id,
        after_json={
            "source_file": source_file,
            "host_count": len(hosts),
            "import_source": "text",
        },
        ip_address=request_ip,
    )
    db.commit()

    for th in hosts:
        try:
            host, created = _find_or_create_host(db, project_id, th, source_file)
            if created:
                summary.hosts_created += 1
                log_audit(
                    db,
                    project_id=project_id,
                    user_id=user_id,
                    action_type="text_host_created",
                    record_type="host",
                    record_id=host.id,
                    after_json={"ip": host.ip, "dns_name": host.dns_name},
                    ip_address=request_ip,
                )
            else:
                summary.hosts_updated += 1
        except Exception as e:
            summary.errors.append(f"Host {th.ip}: {e}")

    log_audit(
        db,
        project_id=project_id,
        user_id=user_id,
        action_type="text_import_completed",
        record_type="project",
        record_id=project_id,
        after_json={
            "source_file": source_file,
            "hosts_created": summary.hosts_created,
            "hosts_updated": summary.hosts_updated,
            "errors": len(summary.errors),
        },
        ip_address=request_ip,
    )
    db.commit()
    return summary
