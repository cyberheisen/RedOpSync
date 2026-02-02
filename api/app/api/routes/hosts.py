from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from fastapi import status

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import Host, Project, Subnet, User
from app.schemas.host import HostCreate, HostUpdate, HostRead
from app.services.audit import log_audit
from app.services.lock import require_lock
from app.services.subnet import find_or_create_subnet_for_ip

router = APIRouter()


@router.get("", response_model=list[HostRead])
def list_hosts(
    project_id: UUID | None = Query(None),
    subnet_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Host)
    if project_id is not None:
        q = q.filter(Host.project_id == project_id)
    if subnet_id is not None:
        q = q.filter(Host.subnet_id == subnet_id)
    return q.order_by(Host.ip).all()


@router.post("", response_model=HostRead, status_code=201)
def create_host(
    body: HostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == body.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    subnet_id = body.subnet_id
    if not subnet_id and body.ip and body.ip.strip().lower() != "unresolved":
        subnet_id = find_or_create_subnet_for_ip(db, body.project_id, body.ip)
    if subnet_id:
        subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
        if not subnet or subnet.project_id != body.project_id:
            raise HTTPException(status_code=404, detail="Subnet not found or not in project")
    host = Host(
        project_id=body.project_id,
        subnet_id=subnet_id,
        ip=body.ip,
        dns_name=body.dns_name,
        tags=list(body.tags) if body.tags else None,
        status=body.status or "unknown",
    )
    db.add(host)
    db.commit()
    db.refresh(host)
    return host


@router.get("/{host_id}", response_model=HostRead)
def get_host(
    host_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    return host


@router.patch("/{host_id}", response_model=HostRead)
def update_host(
    host_id: UUID,
    body: HostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    try:
        require_lock(db, host.project_id, "host", host_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    data = body.model_dump(exclude_unset=True)
    if "subnet_id" in data and data["subnet_id"] is not None:
        subnet = db.query(Subnet).filter(Subnet.id == data["subnet_id"]).first()
        if not subnet or subnet.project_id != host.project_id:
            raise HTTPException(status_code=400, detail="Subnet not found or not in project")
    for k, v in data.items():
        setattr(host, k, v)
    db.commit()
    db.refresh(host)
    return host


@router.delete("/{host_id}", status_code=204)
def delete_host(
    host_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    try:
        require_lock(db, host.project_id, "host", host_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    project_id = host.project_id
    host_ip = host.ip
    host_dns = host.dns_name
    db.delete(host)
    log_audit(
        db,
        project_id=project_id,
        user_id=current_user.id,
        action_type="delete_host",
        record_type="host",
        record_id=host_id,
        after_json={"ip": host_ip, "dns_name": host_dns},
    )
    db.commit()
    return None
