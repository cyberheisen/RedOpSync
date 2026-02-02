from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import Note, User
from app.schemas.note import NoteCreate, NoteRead, NoteUpdate

router = APIRouter()


@router.get("", response_model=list[NoteRead])
def list_notes(
    project_id: UUID | None = Query(None),
    subnet_id: UUID | None = Query(None),
    host_id: UUID | None = Query(None),
    port_id: UUID | None = Query(None),
    evidence_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Note)
    if project_id is not None:
        q = q.filter(Note.project_id == project_id)
    if subnet_id is not None:
        q = q.filter(Note.subnet_id == subnet_id)
    if host_id is not None:
        q = q.filter(Note.host_id == host_id)
    if port_id is not None:
        q = q.filter(Note.port_id == port_id)
    if evidence_id is not None:
        q = q.filter(Note.evidence_id == evidence_id)
    return q.order_by(Note.updated_at.desc()).all()


@router.post("", response_model=NoteRead, status_code=201)
def create_note(
    body: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = Note(
        project_id=body.project_id,
        subnet_id=body.subnet_id,
        host_id=body.host_id,
        port_id=body.port_id,
        evidence_id=body.evidence_id,
        vuln_instance_id=body.vuln_instance_id,
        body_md=body.body_md,
        created_by_user_id=current_user.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteRead)
def update_note(
    note_id: UUID,
    body: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if body.body_md is not None:
        note.body_md = body.body_md
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(
    note_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
