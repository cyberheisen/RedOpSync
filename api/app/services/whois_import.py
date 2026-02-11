"""
Whois/RDAP JSON import: enrich hosts with parsed whois data.

Expects a JSON file: array of objects, each with "ip" (required) and optional
RDAP/whois fields. Parses strong candidates (asn, asn_description, asn_country,
country, network_name) and optional (cidr, network_type, asn_registry) into
host.whois_data. Creates hosts that don't exist (like text import).
"""
from __future__ import annotations

import ipaddress
import json
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.models import Host
from app.services.audit import log_audit
from app.services.subnet import find_or_create_subnet_for_ip

# Keys we extract into whois_data (strong + optional)
WHOIS_KEYS = (
    "asn",
    "asn_description",
    "asn_country",
    "country",
    "network_name",
    "cidr",
    "network_type",
    "asn_registry",
)


@dataclass
class WhoisImportSummary:
    hosts_created: int = 0
    hosts_updated: int = 0
    errors: list[str] = field(default_factory=list)


def _normalize_ip(ip_str: str) -> str | None:
    ip_str = (ip_str or "").strip()
    if not ip_str or ip_str.lower() == "unresolved":
        return None
    try:
        return str(ipaddress.ip_address(ip_str))
    except ValueError:
        return None


def _extract_whois_data(record: dict) -> dict:
    """Build whois_data dict from a single JSON record (strong + optional keys only)."""
    out: dict = {}
    for key in WHOIS_KEYS:
        val = record.get(key)
        if val is None:
            continue
        if isinstance(val, list):
            out[key] = val
        elif isinstance(val, (str, int, float, bool)):
            out[key] = val
        else:
            out[key] = str(val)
    return out


def parse_whois_json(content: bytes, filename: str) -> tuple[list[tuple[str, dict]], list[str]]:
    """
    Parse JSON: array of objects with "ip" and optional whois fields.

    Returns (list of (ip_normalized, whois_data), errors).
    """
    errors: list[str] = []
    results: list[tuple[str, dict]] = []

    try:
        data = json.loads(content.decode("utf-8"))
    except json.JSONDecodeError as e:
        return [], [f"Invalid JSON: {e}"]
    except Exception as e:
        return [], [f"Could not read file: {e}"]

    if not isinstance(data, list):
        return [], ["JSON root must be an array of whois/rdap records."]

    seen: set[str] = set()
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            errors.append(f"Record {i + 1}: not an object, skipped.")
            continue
        ip_raw = item.get("ip")
        if ip_raw is None or (isinstance(ip_raw, str) and not ip_raw.strip()):
            errors.append(f"Record {i + 1}: missing 'ip', skipped.")
            continue
        ip = _normalize_ip(str(ip_raw))
        if not ip:
            errors.append(f"Record {i + 1}: invalid IP '{ip_raw}', skipped.")
            continue
        if ip in seen:
            continue
        seen.add(ip)
        whois_data = _extract_whois_data(item)
        results.append((ip, whois_data))

    return results, errors


def _find_or_create_host(db: Session, project_id: UUID, ip: str) -> tuple[Host, bool]:
    """Find host by IP in project, or create. Returns (host, created)."""
    existing = db.query(Host).filter(Host.project_id == project_id, Host.ip == ip).first()
    if existing:
        return existing, False
    subnet_id = find_or_create_subnet_for_ip(db, project_id, ip)
    host = Host(
        project_id=project_id,
        subnet_id=subnet_id,
        ip=ip,
        dns_name=None,
        status="unknown",
    )
    db.add(host)
    db.commit()
    db.refresh(host)
    return host, True


def run_whois_import(
    db: Session,
    project_id: UUID,
    content: bytes,
    filename: str,
    user_id: UUID,
    request_ip: str | None = None,
) -> WhoisImportSummary:
    """
    Import whois/RDAP JSON: for each record, find or create host and set whois_data.
    """
    summary = WhoisImportSummary()
    records, parse_errors = parse_whois_json(content, filename)
    summary.errors.extend(parse_errors)

    source_file = filename or "whois-import.json"
    for ip, whois_data in records:
        try:
            host, created = _find_or_create_host(db, project_id, ip)
            host.whois_data = whois_data
            db.commit()
            db.refresh(host)
            if created:
                summary.hosts_created += 1
            else:
                summary.hosts_updated += 1
        except Exception as e:
            summary.errors.append(f"{ip}: {e}")

    log_audit(
        db,
        project_id=project_id,
        user_id=user_id,
        action_type="whois_import",
        record_type="project",
        record_id=project_id,
        after_json={
            "filename": source_file,
            "hosts_created": summary.hosts_created,
            "hosts_updated": summary.hosts_updated,
            "errors_count": len(summary.errors),
        },
        ip_address=request_ip,
    )
    return summary
