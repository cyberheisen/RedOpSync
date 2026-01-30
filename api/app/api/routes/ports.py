from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Port, Host
from app.schemas.port import PortCreate, PortUpdate, PortRead

router = APIRouter()


@router.get("", response_model=list[PortRead])
def list_ports(
    host_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Port)
    if host_id is not None:
        q = q.filter(Port.host_id == host_id)
    return q.order_by(Port.host_id, Port.protocol, Port.number).all()


@router.post("", response_model=PortRead, status_code=201)
def create_port(body: PortCreate, db: Session = Depends(get_db)):
    host = db.query(Host).filter(Host.id == body.host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    existing = (
        db.query(Port)
        .filter(
            Port.host_id == body.host_id,
            Port.protocol == body.protocol,
            Port.number == body.number,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Port with same host/protocol/number already exists",
        )
    port = Port(
        host_id=body.host_id,
        protocol=body.protocol,
        number=body.number,
        state=body.state,
        service_name=body.service_name,
        service_version=body.service_version,
        banner=body.banner,
    )
    db.add(port)
    db.commit()
    db.refresh(port)
    return port


@router.get("/{port_id}", response_model=PortRead)
def get_port(port_id: UUID, db: Session = Depends(get_db)):
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")
    return port


@router.patch("/{port_id}", response_model=PortRead)
def update_port(port_id: UUID, body: PortUpdate, db: Session = Depends(get_db)):
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(port, k, v)
    db.commit()
    db.refresh(port)
    return port


@router.delete("/{port_id}", status_code=204)
def delete_port(port_id: UUID, db: Session = Depends(get_db)):
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")
    db.delete(port)
    db.commit()
    return None
