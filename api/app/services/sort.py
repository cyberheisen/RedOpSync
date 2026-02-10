"""Sort helpers for subnets, hosts, and ports (project sort_mode support)."""
from sqlalchemy.orm import Query

from app.models.models import Subnet, Host, Port

SORT_MODES = ("cidr_asc", "cidr_desc", "alpha_asc", "alpha_desc", "last_seen_desc")
DEFAULT_SORT = "cidr_asc"


def apply_subnet_order(q: Query, mode: str) -> Query:
    """Apply sort_mode to a Subnet query."""
    if mode == "cidr_asc":
        return q.order_by(Subnet.cidr.asc())
    if mode == "cidr_desc":
        return q.order_by(Subnet.cidr.desc())
    if mode == "alpha_asc":
        return q.order_by(Subnet.name.asc().nulls_last(), Subnet.cidr.asc())
    if mode == "alpha_desc":
        return q.order_by(Subnet.name.desc().nulls_first(), Subnet.cidr.desc())
    if mode == "last_seen_desc":
        return q.order_by(Subnet.created_at.desc())
    return q.order_by(Subnet.cidr.asc())


def apply_host_order(q: Query, mode: str, *, join_subnet: bool = False) -> Query:
    """Apply sort_mode to a Host query. join_subnet=True joins Subnet for cidr ordering."""
    if join_subnet and mode in ("cidr_asc", "cidr_desc"):
        q = q.outerjoin(Subnet, Host.subnet_id == Subnet.id)
        if mode == "cidr_asc":
            return q.order_by(Subnet.cidr.asc().nulls_last(), Host.ip.asc())
        return q.order_by(Subnet.cidr.desc().nulls_first(), Host.ip.desc())
    if mode == "cidr_asc":
        return q.order_by(Host.ip.asc())
    if mode == "cidr_desc":
        return q.order_by(Host.ip.desc())
    if mode == "alpha_asc":
        return q.order_by(Host.dns_name.asc().nulls_last(), Host.ip.asc())
    if mode == "alpha_desc":
        return q.order_by(Host.dns_name.desc().nulls_first(), Host.ip.desc())
    if mode == "last_seen_desc":
        return q.order_by(Host.updated_at.desc().nulls_last(), Host.ip.asc())
    return q.order_by(Host.ip.asc())


def apply_port_order(q: Query, mode: str) -> Query:
    """Apply sort_mode to a Port query."""
    if mode == "cidr_asc":
        return q.order_by(Port.protocol.asc(), Port.number.asc())
    if mode == "cidr_desc":
        return q.order_by(Port.protocol.desc(), Port.number.desc())
    if mode == "alpha_asc":
        return q.order_by(Port.service_name.asc().nulls_last(), Port.protocol.asc(), Port.number.asc())
    if mode == "alpha_desc":
        return q.order_by(Port.service_name.desc().nulls_first(), Port.protocol.desc(), Port.number.desc())
    if mode == "last_seen_desc":
        return q.order_by(Port.updated_at.desc().nulls_last(), Port.protocol.asc(), Port.number.asc())
    return q.order_by(Port.protocol.asc(), Port.number.asc())
