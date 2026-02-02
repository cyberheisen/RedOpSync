"""Vulnerability affected-hosts computation including subnet inheritance."""
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.models import (
    VulnerabilityDefinition,
    VulnerabilityInstance,
    VulnerabilitySubnetAssociation,
    Host,
)


def get_affected_host_ids(db: Session, defn: VulnerabilityDefinition) -> list[UUID]:
    """Compute affected host IDs: direct instances + hosts in associated subnets."""
    direct = {
        i.host_id
        for i in db.query(VulnerabilityInstance)
        .filter(VulnerabilityInstance.vulnerability_definition_id == defn.id)
        .all()
    }
    subnet_ids = [
        a.subnet_id
        for a in db.query(VulnerabilitySubnetAssociation)
        .filter(VulnerabilitySubnetAssociation.vulnerability_definition_id == defn.id)
        .all()
    ]
    from_subnets = {
        h.id
        for h in db.query(Host)
        .filter(Host.subnet_id.in_(subnet_ids), Host.project_id == defn.project_id)
        .all()
    }
    return list(direct | from_subnets)
