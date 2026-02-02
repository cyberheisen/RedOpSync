"""Subnet helpers: auto-create subnets from host IPs."""
from __future__ import annotations

import ipaddress
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.models import Subnet


def _cidr_for_ip(ip_str: str) -> str | None:
    """Derive a /24 (IPv4) or /64 (IPv6) CIDR that contains the given IP. Returns None for invalid or unresolved."""
    ip_str = (ip_str or "").strip().lower()
    if not ip_str or ip_str == "unresolved":
        return None
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return None
    if isinstance(addr, ipaddress.IPv4Address):
        network = ipaddress.ip_network(f"{addr}/24", strict=False)
    else:
        network = ipaddress.ip_network(f"{addr}/64", strict=False)
    return str(network)


def find_or_create_subnet_for_ip(db: Session, project_id: UUID, ip: str) -> UUID | None:
    """
    Find or create a subnet for the given IP. Returns subnet_id or None.

    - IPv4: uses /24 (e.g. 192.168.1.50 -> 192.168.1.0/24)
    - IPv6: uses /64
    - Returns None for "unresolved" or invalid IPs
    """
    cidr = _cidr_for_ip(ip)
    if not cidr:
        return None

    existing = db.query(Subnet).filter(Subnet.project_id == project_id, Subnet.cidr == cidr).first()
    if existing:
        return existing.id

    subnet = Subnet(project_id=project_id, cidr=cidr, name=None)
    db.add(subnet)
    db.commit()
    db.refresh(subnet)
    return subnet.id
