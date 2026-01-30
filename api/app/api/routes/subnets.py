from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Subnet, Project
from app.schemas.subnet import SubnetCreate, SubnetUpdate, SubnetRead

router = APIRouter()


@router.get("", response_model=list[SubnetRead])
def list_subnets(
    project_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Subnet)
    if project_id is not None:
        q = q.filter(Subnet.project_id == project_id)
    return q.order_by(Subnet.created_at).all()


@router.post("", response_model=SubnetRead, status_code=201)
def create_subnet(body: SubnetCreate, db: Session = Depends(get_db)):
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
def get_subnet(subnet_id: UUID, db: Session = Depends(get_db)):
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")
    return subnet


@router.patch("/{subnet_id}", response_model=SubnetRead)
def update_subnet(subnet_id: UUID, body: SubnetUpdate, db: Session = Depends(get_db)):
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(subnet, k, v)
    db.commit()
    db.refresh(subnet)
    return subnet


@router.delete("/{subnet_id}", status_code=204)
def delete_subnet(subnet_id: UUID, db: Session = Depends(get_db)):
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")
    db.delete(subnet)
    db.commit()
    return None
