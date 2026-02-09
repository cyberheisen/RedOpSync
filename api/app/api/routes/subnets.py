from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from fastapi import status

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import Host, Subnet, Project, User
from app.schemas.subnet import SubnetCreate, SubnetUpdate, SubnetRead
from app.services.audit import log_audit
from app.services.lock import require_lock
from app.services.sort import apply_subnet_order, SORT_MODES, DEFAULT_SORT

router = APIRouter()


def _resolve_sort_mode(db: Session, project_id: UUID | None, sort_mode: str | None) -> str:
    if sort_mode and sort_mode in SORT_MODES:
        return sort_mode
    if project_id:
        proj = db.query(Project).filter(Project.id == project_id).first()
        if proj and getattr(proj, "sort_mode", None) in SORT_MODES:
            return proj.sort_mode
    return DEFAULT_SORT


@router.get("", response_model=list[SubnetRead])
def list_subnets(
    project_id: UUID | None = Query(None),
    sort_mode: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Subnet)
    if project_id is not None:
        q = q.filter(Subnet.project_id == project_id)
    mode = _resolve_sort_mode(db, project_id, sort_mode)
    q = apply_subnet_order(q, mode)
    return q.all()


@router.post("", response_model=SubnetRead, status_code=201)
def create_subnet(
    body: SubnetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == body.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    subnet = Subnet(
        project_id=body.project_id,
        cidr=body.cidr,
        name=body.name,
    )
    db.add(subnet)
    db.commit()
    db.refresh(subnet)
    return subnet


@router.get("/{subnet_id}", response_model=SubnetRead)
def get_subnet(
    subnet_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")
    return subnet


@router.patch("/{subnet_id}", response_model=SubnetRead)
def update_subnet(
    subnet_id: UUID,
    body: SubnetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")
    try:
        require_lock(db, subnet.project_id, "subnet", subnet_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(subnet, k, v)
    db.commit()
    db.refresh(subnet)
    return subnet


@router.delete("/{subnet_id}", status_code=204)
def delete_subnet(
    subnet_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")
    try:
        require_lock(db, subnet.project_id, "subnet", subnet_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    project_id = subnet.project_id
    cidr = subnet.cidr
    name = subnet.name
    # Delete all hosts in this subnet first (cascades to ports, evidence, vuln instances, notes)
    hosts_in_subnet = db.query(Host).filter(Host.subnet_id == subnet_id).all()
    for host in hosts_in_subnet:
        db.delete(host)
    db.delete(subnet)
    log_audit(
        db,
        project_id=project_id,
        user_id=current_user.id,
        action_type="delete_subnet",
        record_type="subnet",
        record_id=subnet_id,
        after_json={"cidr": cidr, "name": name, "hosts_deleted": len(hosts_in_subnet)},
    )
    db.commit()
    return None
