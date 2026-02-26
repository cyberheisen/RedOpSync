"""
Live whois/RDAP lookup for an IP. Fetches from a public RDAP service and maps
the response to our whois_data shape (asn, asn_description, country, etc.).
"""
from __future__ import annotations

import ipaddress
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.models.models import Host, Subnet
from app.services.whois_import import _whois_owner
from app.services.subnet import find_or_create_subnet_for_ip

# Keys we store (same as whois_import)
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

RDAP_TIMEOUT = 15.0


def _normalize_ip(ip_str: str) -> str | None:
    ip_str = (ip_str or "").strip()
    if not ip_str or ip_str.lower() == "unresolved":
        return None
    try:
        return str(ipaddress.ip_address(ip_str))
    except ValueError:
        return None


def _rdap_to_whois_data(rdap: dict, ip: str) -> dict:
    """Map RDAP IP network response to our whois_data dict."""
    out: dict = {}
    # CIDR: from startAddress/endAddress or cidr0_cidrs
    if "startAddress" in rdap and "endAddress" in rdap:
        try:
            start = ipaddress.ip_address(rdap["startAddress"])
            end = ipaddress.ip_address(rdap["endAddress"])
            # Approximate single-prefix display
            out["cidr"] = f"{rdap['startAddress']}/{start.max_prefixlen - (int(end) - int(start)).bit_length()}" if start.version == 4 else f"{rdap['startAddress']}-{rdap['endAddress']}"
        except Exception:
            out["cidr"] = rdap.get("startAddress") or ip
    # name on the network object
    if rdap.get("name"):
        out["network_name"] = rdap["name"]
    # country on the network object (some RDAP servers put it here)
    if rdap.get("country"):
        out["country"] = rdap["country"] if isinstance(rdap["country"], str) else rdap.get("country", {}).get("name") or str(rdap["country"])
    # Walk entities for ASN and org name
    for entity in rdap.get("entities") or []:
        if not isinstance(entity, dict):
            continue
        # vCard "org" or "fn" for name
        for v in (entity.get("vcardArray") or []):
            if not isinstance(v, list):
                continue
            for part in v:
                if isinstance(part, list) and len(part) >= 2:
                    kind = part[0] if isinstance(part[0], str) else None
                    if kind == "org":
                        val = part[3] if len(part) > 3 else part[2] if len(part) > 2 else None
                        if isinstance(val, str) and val.strip():
                            out.setdefault("asn_description", val.strip())
                        elif isinstance(val, list) and val:
                            out.setdefault("asn_description", str(val[0]).strip())
                    if kind == "adr" and isinstance(part[3], list):
                        # Country in address
                        for c in part[3]:
                            if c and isinstance(c, str) and len(c) == 2 and c.isalpha():
                                out.setdefault("country", c)
                                break
        # Some RDAP put asn in the entity
        if "asn" in entity and out.get("asn") is None:
            out["asn"] = str(entity["asn"])
        if entity.get("roles") and "registrant" in entity.get("roles", []) and entity.get("vcardArray"):
            for v in entity.get("vcardArray") or []:
                if isinstance(v, list):
                    for part in v:
                        if isinstance(part, list) and len(part) >= 2 and part[0] == "org":
                            val = part[3] if len(part) > 3 else part[2]
                            if isinstance(val, str) and val.strip():
                                out.setdefault("asn_description", val.strip())
    # Top-level asn (some servers)
    if rdap.get("asn") is not None and out.get("asn") is None:
        out["asn"] = str(rdap["asn"])
    # Keep only allowed keys
    return {k: out[k] for k in WHOIS_KEYS if k in out and out[k] is not None}


def fetch_rdap_for_ip(ip: str) -> dict | None:
    """Fetch RDAP data for an IP from a public RDAP service. Returns whois_data-shaped dict or None on failure."""
    ip_norm = _normalize_ip(ip)
    if not ip_norm:
        return None
    url = f"https://rdap.org/ip/{ip_norm}"
    try:
        with httpx.Client(timeout=RDAP_TIMEOUT) as client:
            r = client.get(url)
            if r.status_code != 200:
                return None
            data = r.json()
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    return _rdap_to_whois_data(data, ip_norm)


def run_whois_lookup(
    db: Session,
    project_id: UUID,
    *,
    host_id: UUID | None = None,
    subnet_id: UUID | None = None,
    ip: str | None = None,
) -> tuple[int, list[str]]:
    """
    Run whois/RDAP lookup and update host(s). Returns (updated_count, errors).
    One of host_id, subnet_id, or ip must be provided.
    """
    errors: list[str] = []
    updated = 0
    ips_to_lookup: list[str] = []

    if host_id:
        host = db.query(Host).filter(Host.project_id == project_id, Host.id == host_id).first()
        if not host:
            errors.append("Host not found")
            return 0, errors
        if _normalize_ip(host.ip):
            ips_to_lookup.append(host.ip)
    elif subnet_id:
        hosts_in_subnet = db.query(Host).filter(Host.project_id == project_id, Host.subnet_id == subnet_id).all()
        seen_ips: set[str] = set()
        for h in hosts_in_subnet:
            n = _normalize_ip(h.ip)
            if n and n not in seen_ips:
                seen_ips.add(n)
                ips_to_lookup.append(h.ip)
    elif ip:
        n = _normalize_ip(ip)
        if n:
            ips_to_lookup.append(ip)
        else:
            errors.append("Invalid IP")
            return 0, errors
    else:
        errors.append("Provide host_id, subnet_id, or ip")
        return 0, errors

    for ip_str in ips_to_lookup:
        whois_data = fetch_rdap_for_ip(ip_str)
        if not whois_data:
            errors.append(f"{ip_str}: lookup failed or no data")
            continue
        hosts = db.query(Host).filter(Host.project_id == project_id, Host.ip == ip_str).all()
        if not hosts:
            # Create one host so we have a record
            subnet_id = find_or_create_subnet_for_ip(db, project_id, ip_str)
            new_host = Host(
                project_id=project_id,
                subnet_id=subnet_id,
                ip=ip_str,
                dns_name=None,
                status="unknown",
            )
            db.add(new_host)
            db.flush()
            hosts = [new_host]
        owner = _whois_owner(whois_data)
        for host in hosts:
            host.whois_data = whois_data
            if host.subnet_id and owner:
                subnet = db.query(Subnet).filter(Subnet.id == host.subnet_id).first()
                if subnet and subnet.name != owner:
                    subnet.name = owner
            updated += 1
        db.commit()
    return updated, errors
