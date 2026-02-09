from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import Note, User, Port
from app.schemas.note import NoteCreate, NoteRead, NoteUpdate

router = APIRouter()


def _note_to_read(n: Note) -> NoteRead:
    tt, tid = n.target_type, n.target_id
    if tt == "scope" and (n.port_id or n.host_id or n.subnet_id or n.evidence_id):
        if n.port_id:
            tt, tid = "port", n.port_id
        elif n.host_id:
            tt, tid = "host", n.host_id
        elif n.subnet_id:
            tt, tid = "subnet", n.subnet_id
        elif n.evidence_id:
            tt, tid = "evidence", n.evidence_id
    return NoteRead(
        id=n.id,
        project_id=n.project_id,
        target_type=tt,
        target_id=tid,
        subnet_id=n.subnet_id,
        host_id=n.host_id,
        port_id=n.port_id,
        evidence_id=n.evidence_id,
        vuln_instance_id=n.vuln_instance_id,
        body_md=n.body_md,
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


def _resolve_note_target_to_fks(
    db: Session,
    target_type: str | None,
    target_id: UUID | None,
    subnet_id: UUID | None,
    host_id: UUID | None,
    port_id: UUID | None,
    evidence_id: UUID | None,
) -> tuple[str, UUID | None, UUID | None, UUID | None, UUID | None, UUID | None]:
    """Return (target_type, target_id, subnet_id, host_id, port_id, evidence_id)."""
    if target_type is not None:
        tt, tid = target_type, target_id
        if tt == "scope":
            return ("scope", None, None, None, None, None)
        if tt == "vulnerabilities":
            return ("vulnerabilities", None, None, None, None, None)
        if tt == "vulnerability_definition" and tid:
            return ("vulnerability_definition", tid, None, None, None, None)
        if tt == "subnet" and tid:
            return ("subnet", tid, tid, None, None, None)
        if tt == "host" and tid:
            return ("host", tid, None, tid, None, None)
        if tt == "host_ports" and tid:
            return ("host_ports", tid, None, tid, None, None)
        if tt == "port" and tid:
            port = db.query(Port).filter(Port.id == tid).first()
            hid = port.host_id if port else None
            return ("port", tid, None, hid, tid, None)
        if tt == "evidence" and tid:
            return ("evidence", tid, None, None, None, tid)
    if port_id:
        port = db.query(Port).filter(Port.id == port_id).first()
        hid = port.host_id if port else host_id
        return ("port", port_id, None, hid, port_id, None)
    if host_id:
        return ("host", host_id, None, host_id, None, None)
    if subnet_id:
        return ("subnet", subnet_id, subnet_id, None, None, None)
    if evidence_id:
        return ("evidence", evidence_id, None, None, None, evidence_id)
    return ("scope", None, None, None, None, None)


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
    notes = q.order_by(Note.updated_at.desc()).all()
    return [_note_to_read(n) for n in notes]


@router.post("", response_model=NoteRead, status_code=201)
def create_note(
    body: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tt, tid, snid, hid, pid, eid = _resolve_note_target_to_fks(
        db,
        body.target_type,
        body.target_id,
        body.subnet_id,
        body.host_id,
        body.port_id,
        body.evidence_id,
    )
    note = Note(
        project_id=body.project_id,
        target_type=tt,
        target_id=tid,
        subnet_id=snid,
        host_id=hid,
        port_id=pid,
        evidence_id=eid,
        vuln_instance_id=body.vuln_instance_id,
        body_md=body.body_md,
        created_by_user_id=current_user.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _note_to_read(note)


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
    return _note_to_read(note)


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
