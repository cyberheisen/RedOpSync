"""
Nmap import: ingest Nmap scan results and populate Hosts, Ports, Evidence.

- Creates/merges hosts (by IP, DNS)
- Unresolved hosts (hostname-only) -> Scope/Unresolved (subnet_id=None, status=unresolved)
- Host ONLINE only when nmap status=up (ignore ports for status)
- Ports keyed by (port, protocol), tunnel (ssl) in banner
- Structured Evidence: Response code, Server header, Security headers (each), TLS, Raw banner
- Import metadata (nmap version, args, scan start/end) in audit
- discovered_by=nmap, source_file, imported_at on all imported data
- Never overwrite manual data; same-source (nmap) may update previous nmap data
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.models import Evidence, Host, Port, Project
from app.services.audit import log_audit
from app.services.nmap_parser import (
    NMAP_SOURCE,
    UNRESOLVED_IP,
    NmapHost,
    NmapImportMetadata,
    NmapParseResult,
)
from app.services.subnet import find_or_create_subnet_for_ip


@dataclass
class NmapImportSummary:
    """Structured import summary for Nmap."""

    hosts_created: int = 0
    hosts_updated: int = 0
    ports_created: int = 0
    ports_updated: int = 0
    evidence_created: int = 0
    errors: list[str] = field(default_factory=list)


def _host_status_from_nmap(nh: NmapHost) -> str:
    """Host status from Nmap: ONLINE only when status=up, else OFFLINE. Unresolved stays unresolved."""
    if nh.is_unresolved:
        return "unresolved"
    return "online" if nh.status.lower() == "up" else "offline"


def _find_or_create_host(
    db: Session,
    project_id: UUID,
    nh: NmapHost,
    source_file: str,
    imported_at: datetime,
) -> tuple[Host, bool]:
    """Find or create host. Returns (host, created). Match by (project_id, ip, dns_name) for resolved so same IP with different hostname creates a new host."""
    ip = nh.ip or UNRESOLVED_IP
    dns = nh.hostname
    is_unresolved = nh.is_unresolved
    dns_norm = (dns or "").strip() or None

    q = db.query(Host).filter(Host.project_id == project_id)
    if not is_unresolved and ip != UNRESOLVED_IP:
        q_ip = q.filter(Host.ip == ip)
        if dns_norm:
            existing = q_ip.filter(Host.dns_name == dns_norm).first()
        else:
            existing = q_ip.filter(or_(Host.dns_name.is_(None), Host.dns_name == "")).first()
        if existing is None and dns_norm:
            existing = q.filter(Host.ip == UNRESOLVED_IP, Host.dns_name == dns_norm).first()
    else:
        existing = q.filter(Host.dns_name == dns).first() if dns else None
        if not existing and dns:
            existing = q.filter(
                Host.project_id == project_id,
                Host.ip == UNRESOLVED_IP,
                Host.dns_name == dns,
            ).first()

    if existing:
        need_update = False
        if dns and (not existing.dns_name or existing.dns_name != dns):
            existing.dns_name = dns
            need_update = True
        if existing.ip == UNRESOLVED_IP and not is_unresolved and ip != UNRESOLVED_IP:
            existing.ip = ip
            new_subnet = find_or_create_subnet_for_ip(db, project_id, ip)
            if new_subnet:
                existing.subnet_id = new_subnet
            need_update = True
        new_status = _host_status_from_nmap(nh)
        # Host model has no discovered_by; only update status when unknown (manual data wins otherwise)
        if existing.status in (None, "unknown"):
            existing.status = new_status
            need_update = True
        if is_unresolved:
            existing.status = "unresolved"
            need_update = True
        if need_update:
            db.commit()
            db.refresh(existing)
        return existing, False

    subnet_id = find_or_create_subnet_for_ip(db, project_id, ip) if not is_unresolved and ip != UNRESOLVED_IP else None
    status = _host_status_from_nmap(nh)

    host = Host(
        project_id=project_id,
        subnet_id=subnet_id,
        ip=ip,
        dns_name=dns,
        status=status,
    )
    db.add(host)
    db.commit()
    db.refresh(host)
    return host, True


def _build_service_banner(nh_port) -> str:
    """Build Server-style banner from product, version, extrainfo, tunnel."""
    parts = []
    if getattr(nh_port, "tunnel", None):
        parts.append(f"tunnel={nh_port.tunnel}")
    if nh_port.product:
        parts.append(nh_port.product)
    if nh_port.version:
        parts.append(nh_port.version)
    if nh_port.extrainfo:
        parts.append(nh_port.extrainfo)
    return " ".join(parts).strip() if parts else ""


def _build_scan_metadata(
    nh_port,
    import_metadata: NmapImportMetadata | None,
    host_starttime: str | None,
    host_endtime: str | None,
) -> dict:
    """Build scan_metadata dict for Port from Nmap port + run metadata."""
    meta: dict = {}
    if getattr(nh_port, "state_reason", None):
        meta["state_reason"] = nh_port.state_reason
    if getattr(nh_port, "state_reason_ttl", None) is not None:
        meta["state_reason_ttl"] = nh_port.state_reason_ttl
    if getattr(nh_port, "service_conf", None) is not None:
        meta["service_conf"] = nh_port.service_conf
    if getattr(nh_port, "service_method", None):
        meta["service_method"] = nh_port.service_method
    if getattr(nh_port, "devicetype", None):
        meta["devicetype"] = nh_port.devicetype
    if import_metadata and import_metadata.args:
        meta["nmap_args"] = import_metadata.args
    if host_starttime:
        meta["scan_start"] = host_starttime
    elif import_metadata and import_metadata.scan_start:
        meta["scan_start"] = import_metadata.scan_start
    if host_endtime:
        meta["scan_end"] = host_endtime
    elif import_metadata and import_metadata.scan_end:
        meta["scan_end"] = import_metadata.scan_end
    return meta


def _parse_epoch_to_utc(epoch_str: str | None) -> datetime | None:
    """Convert Unix epoch string to timezone-aware datetime. Returns None if invalid."""
    if not epoch_str:
        return None
    try:
        ts = int(epoch_str)
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    except (ValueError, OSError):
        return None


def _evidence_caption_exists(db: Session, port_id: UUID, caption_prefix: str) -> bool:
    """Check if evidence with this caption prefix from nmap already exists."""
    q = db.query(Evidence).filter(
        Evidence.port_id == port_id,
        Evidence.source == NMAP_SOURCE,
        Evidence.stored_path.is_(None),
    )
    for ev in q:
        if ev.caption and ev.caption.startswith(caption_prefix):
            return True
    return False


def _add_evidence(
    db: Session,
    project_id: UUID,
    host_id: UUID,
    port_id: UUID,
    caption: str,
    filename: str,
    source_file: str,
    imported_at: datetime,
) -> bool:
    """Add evidence. Returns True if added."""
    ev = Evidence(
        project_id=project_id,
        host_id=host_id,
        port_id=port_id,
        filename=filename,
        caption=caption,
        mime=None,
        stored_path=None,
        is_pasted=False,
        source=NMAP_SOURCE,
        imported_at=imported_at,
        source_file=source_file,
    )
    db.add(ev)
    db.commit()
    return True


def _find_or_create_port(
    db: Session,
    host: Host,
    nh_port,
    source_file: str,
    imported_at: datetime,
    summary: NmapImportSummary,
    import_metadata: NmapImportMetadata | None = None,
    host_starttime: str | None = None,
    host_endtime: str | None = None,
) -> tuple[Port, bool]:
    """Find or create port. Merge service/version only if empty. Returns (port, created)."""
    proto = (nh_port.protocol or "tcp").lower()
    if proto not in ("tcp", "udp"):
        proto = "tcp"

    scan_metadata = _build_scan_metadata(nh_port, import_metadata, host_starttime, host_endtime)
    scanned_at = _parse_epoch_to_utc(host_starttime)

    existing = (
        db.query(Port)
        .filter(Port.host_id == host.id, Port.protocol == proto, Port.number == nh_port.port_id)
        .first()
    )

    if existing:
        need_commit = False
        is_same_source = (existing.discovered_by or "").lower() == NMAP_SOURCE
        if (not existing.service_name or is_same_source) and nh_port.service_name:
            existing.service_name = nh_port.service_name[:255]
            need_commit = True
        if (not existing.service_version or is_same_source) and nh_port.version:
            existing.service_version = nh_port.version[:255]
            need_commit = True
        banner = _build_service_banner(nh_port)
        if banner and (not existing.banner or is_same_source):
            existing.banner = banner[:2000]
            need_commit = True
        if (not existing.state or is_same_source) and nh_port.state:
            existing.state = nh_port.state[:32]
            need_commit = True
        if not existing.discovered_by:
            existing.discovered_by = NMAP_SOURCE
            need_commit = True
        if is_same_source and scan_metadata:
            existing.scan_metadata = scan_metadata
            need_commit = True
        if is_same_source and scanned_at is not None:
            existing.scanned_at = scanned_at
            need_commit = True
        if need_commit:
            db.commit()
            db.refresh(existing)
            summary.ports_updated += 1
        return existing, False

    banner = _build_service_banner(nh_port)
    port = Port(
        host_id=host.id,
        protocol=proto,
        number=nh_port.port_id,
        state=nh_port.state[:32] if nh_port.state else "unknown",
        service_name=nh_port.service_name[:255] if nh_port.service_name else None,
        service_version=nh_port.version[:255] if nh_port.version else None,
        banner=banner[:2000] if banner else None,
        discovered_by=NMAP_SOURCE,
        scan_metadata=scan_metadata if scan_metadata else None,
        scanned_at=scanned_at,
    )
    db.add(port)
    db.commit()
    db.refresh(port)
    return port, True


_HTTP_RESPONSE_RE = re.compile(r"^\s*HTTP/[\d.]+\s+(\d+)", re.M | re.I)
_SECURITY_HEADERS = ("x-frame-options", "content-security-policy", "x-content-type-options", "strict-transport-security", "x-xss-protection")


def _parse_http_headers(script_output: str) -> dict[str, str]:
    """Parse http-headers script output into header name -> value."""
    out: dict[str, str] = {}
    for line in script_output.splitlines():
        if ":" in line:
            idx = line.index(":")
            name = line[:idx].strip().lower()
            val = line[idx + 1 :].strip()
            if name and val:
                out[name] = val
    return out


def _add_port_evidence(
    db: Session,
    project_id: UUID,
    host_id: UUID,
    port: Port,
    nh_port,
    source_file: str,
    imported_at: datetime,
    summary: NmapImportSummary,
) -> None:
    """Add structured evidence: Response code, Server, Security headers (each), TLS, Raw banner."""
    scripts_by_id = {s.id: s for s in nh_port.scripts if s.id}

    server_val = None
    http_server = scripts_by_id.get("http-server-header")
    if http_server and http_server.output:
        server_val = http_server.output.strip()
    if not server_val:
        server_val = _build_service_banner(nh_port)
    if server_val and not _evidence_caption_exists(db, port.id, "Server:"):
        cap = f"Server: {server_val} [{NMAP_SOURCE}]"
        if _add_evidence(db, project_id, host_id, port.id, cap, "server", source_file, imported_at):
            summary.evidence_created += 1

    response_code = None
    headers_parsed: dict[str, str] = {}
    http_headers = scripts_by_id.get("http-headers")
    if http_headers and http_headers.output:
        m = _HTTP_RESPONSE_RE.search(http_headers.output)
        if m:
            response_code = m.group(1)
        headers_parsed = _parse_http_headers(http_headers.output)

    if response_code and not _evidence_caption_exists(db, port.id, "Response code:"):
        cap = f"Response code: {response_code} [{NMAP_SOURCE}]"
        if _add_evidence(db, project_id, host_id, port.id, cap, "response-code", source_file, imported_at):
            summary.evidence_created += 1

    for hname in _SECURITY_HEADERS:
        if hname in headers_parsed and not _evidence_caption_exists(db, port.id, f"{hname}:"):
            cap = f"{hname}: {headers_parsed[hname]} [{NMAP_SOURCE}]"
            if _add_evidence(db, project_id, host_id, port.id, cap, f"header-{hname}", source_file, imported_at):
                summary.evidence_created += 1

    ssl_cert = scripts_by_id.get("ssl-cert")
    if ssl_cert and ssl_cert.output and not _evidence_caption_exists(db, port.id, "TLS"):
        cap = f"TLS / Certificate [{NMAP_SOURCE}]\n\n{ssl_cert.output}"
        if _add_evidence(db, project_id, host_id, port.id, cap, "ssl-cert", source_file, imported_at):
            summary.evidence_created += 1

    raw_parts = []
    for s in nh_port.scripts:
        if s.output:
            raw_parts.append(f"{s.id}:\n{s.output}")
    if raw_parts and not _evidence_caption_exists(db, port.id, "Raw banner"):
        cap = f"Raw banner [{NMAP_SOURCE}]\n\n" + "\n\n".join(raw_parts)
        if _add_evidence(db, project_id, host_id, port.id, cap, "raw-banner", source_file, imported_at):
            summary.evidence_created += 1


def run_nmap_import(
    db: Session,
    project_id: UUID,
    parse_result: NmapParseResult,
    user_id: UUID,
    request_ip: str | None = None,
) -> NmapImportSummary:
    """
    Import Nmap parse result into mission. Creates/merges hosts, ports, evidence, notes.
    Partial imports save valid hosts; errors are collected.
    """
    summary = NmapImportSummary()
    imported_at = datetime.now(timezone.utc)
    source_file = parse_result.source_file or "nmap-import"

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        summary.errors.append("Project not found")
        return summary

    summary.errors.extend(parse_result.errors)

    meta = parse_result.import_metadata
    audit_after = {
        "source_file": source_file,
        "host_count": len(parse_result.hosts),
        "import_source": "nmap",
    }
    if meta:
        audit_after["nmap_version"] = meta.nmap_version
        audit_after["args"] = meta.args
        audit_after["scan_start"] = meta.scan_start
        audit_after["scan_end"] = meta.scan_end
        if meta.task_times:
            audit_after["task_times"] = meta.task_times
            audit_after["first_task_time"] = meta.task_times[0]
            audit_after["last_task_time"] = meta.task_times[-1]

    log_audit(
        db,
        project_id=project_id,
        user_id=user_id,
        action_type="nmap_import_started",
        record_type="project",
        record_id=project_id,
        after_json=audit_after,
        ip_address=request_ip,
    )
    db.commit()

    for nh in parse_result.hosts:
        try:
            host, host_created = _find_or_create_host(db, project_id, nh, source_file, imported_at)
            if host_created:
                summary.hosts_created += 1
                log_audit(
                    db,
                    project_id=project_id,
                    user_id=user_id,
                    action_type="nmap_host_created",
                    record_type="host",
                    record_id=host.id,
                    after_json={"ip": host.ip, "dns_name": host.dns_name},
                    ip_address=request_ip,
                )
            else:
                summary.hosts_updated += 1

            meta = parse_result.import_metadata
            for nh_port in nh.ports:
                try:
                    port, port_created = _find_or_create_port(
                        db,
                        host,
                        nh_port,
                        source_file,
                        imported_at,
                        summary,
                        import_metadata=meta,
                        host_starttime=getattr(nh, "starttime", None),
                        host_endtime=getattr(nh, "endtime", None),
                    )
                    if port_created:
                        summary.ports_created += 1
                        log_audit(
                            db,
                            project_id=project_id,
                            user_id=user_id,
                            action_type="nmap_port_created",
                            record_type="port",
                            record_id=port.id,
                            after_json={"number": port.number, "protocol": port.protocol},
                            ip_address=request_ip,
                        )

                    _add_port_evidence(
                        db, project_id, host.id, port, nh_port, source_file, imported_at, summary
                    )
                except Exception as e:
                    summary.errors.append(f"Port {nh_port.port_id}/{nh_port.protocol}: {e}")
        except Exception as e:
            summary.errors.append(f"Host {nh.ip or nh.hostname}: {e}")

    meta = parse_result.import_metadata
    completed_json = {
        "source_file": source_file,
        "hosts_created": summary.hosts_created,
        "hosts_updated": summary.hosts_updated,
        "ports_created": summary.ports_created,
        "ports_updated": summary.ports_updated,
        "evidence_created": summary.evidence_created,
        "errors": len(summary.errors),
    }
    if meta:
        completed_json["nmap_version"] = meta.nmap_version
        completed_json["args"] = meta.args
        if meta.task_times:
            completed_json["task_times"] = meta.task_times
            completed_json["first_task_time"] = meta.task_times[0]
            completed_json["last_task_time"] = meta.task_times[-1]

    log_audit(
        db,
        project_id=project_id,
        user_id=user_id,
        action_type="nmap_import_completed",
        record_type="project",
        record_id=project_id,
        after_json=completed_json,
        ip_address=request_ip,
    )
    db.commit()
    return summary
