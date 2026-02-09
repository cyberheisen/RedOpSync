from uuid import UUID
import os
import uuid as uuid_mod
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from fastapi import status

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import Evidence, Port, Host, User
from app.schemas.port import PortCreate, PortUpdate, PortRead, PortReadWithAttachments, PortAttachmentSummary
from app.schemas.evidence import EvidenceRead, EvidenceNotesUpdate
from app.services.lock import require_lock
from app.services.audit import log_audit
from app.services.sort import apply_port_order, SORT_MODES, DEFAULT_SORT

router = APIRouter()


@router.get("", response_model=list[PortRead])
def list_ports(
    host_id: UUID | None = Query(None),
    sort_mode: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Port)
    if host_id is not None:
        q = q.filter(Port.host_id == host_id)
    mode = sort_mode if sort_mode in SORT_MODES else DEFAULT_SORT
    q = apply_port_order(q, mode)
    return q.all()


@router.post("", response_model=PortRead, status_code=201)
def create_port(
    body: PortCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
        state=body.state or "unknown",
        service_name=body.service_name,
        service_version=body.service_version,
        banner=body.banner,
        description_md=body.description_md,
        evidence_md=body.evidence_md,
        discovered_by=body.discovered_by or "manual",
    )
    db.add(port)
    db.commit()
    db.refresh(port)
    return port


@router.get("/{port_id}", response_model=PortReadWithAttachments)
def get_port(
    port_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")
    atts = (
        db.query(Evidence)
        .options(joinedload(Evidence.uploaded_by))
        .filter(Evidence.port_id == port_id)
        .order_by(Evidence.created_at.asc())
        .all()
    )
    att_list = [
        PortAttachmentSummary(
            id=a.id,
            filename=a.filename,
            caption=a.caption,
            mime=a.mime,
            size=a.size,
            is_pasted=bool(a.is_pasted),
            source=a.source,
            notes_md=a.notes_md,
            uploaded_by_username=a.uploaded_by.username if a.uploaded_by else None,
            created_at=a.created_at,
        )
        for a in atts
    ]
    return PortReadWithAttachments(
        **{c.key: getattr(port, c.key) for c in port.__table__.columns},
        attachments=att_list,
    )


@router.patch("/{port_id}", response_model=PortRead)
def update_port(
    port_id: UUID,
    body: PortUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")
    try:
        require_lock(db, port.host.project_id, "port", port_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(port, k, v)
    db.commit()
    db.refresh(port)
    return port


@router.delete("/{port_id}", status_code=204)
def delete_port(
    port_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")
    try:
        require_lock(db, port.host.project_id, "port", port_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    db.delete(port)
    db.commit()
    return None


@router.get("/{port_id}/attachments", response_model=list[EvidenceRead])
def list_port_attachments(
    port_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")
    atts = (
        db.query(Evidence)
        .options(joinedload(Evidence.uploaded_by))
        .filter(Evidence.port_id == port_id)
        .order_by(Evidence.created_at.asc())
        .all()
    )
    return [
        EvidenceRead(
            id=a.id,
            port_id=a.port_id,
            filename=a.filename,
            caption=a.caption,
            mime=a.mime,
            size=a.size,
            is_pasted=bool(a.is_pasted),
            source=a.source,
            notes_md=a.notes_md,
            uploaded_by_username=a.uploaded_by.username if a.uploaded_by else None,
            created_at=a.created_at,
        )
        for a in atts
    ]


@router.post("/{port_id}/attachments", response_model=EvidenceRead, status_code=201)
def upload_port_attachment(
    port_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")
    try:
        require_lock(db, port.host.project_id, "port", port_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    base = os.path.join(settings.attachments_dir, "evidence", "port", str(port_id))
    os.makedirs(base, exist_ok=True)
    ext = os.path.splitext(file.filename or "file")[1] or ""
    fname = f"{uuid_mod.uuid4().hex}{ext}"
    path = os.path.join(base, fname)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    size = os.path.getsize(path)
    ev = Evidence(
        project_id=port.host.project_id,
        host_id=port.host_id,
        port_id=port_id,
        filename=file.filename or "uploaded",
        mime=file.content_type,
        size=size,
        stored_path=path,
        is_pasted=False,
        created_by_user_id=current_user.id,
    )
    db.add(ev)
    log_audit(
        db,
        project_id=port.host.project_id,
        user_id=current_user.id,
        action_type="port_attachment_uploaded",
        record_type="port",
        record_id=port_id,
        after_json={"attachment_id": str(ev.id), "filename": ev.filename},
    )
    db.commit()
    db.refresh(ev)
    return EvidenceRead(
        id=ev.id,
        port_id=ev.port_id,
        filename=ev.filename,
        mime=ev.mime,
        size=ev.size,
        is_pasted=False,
        uploaded_by_username=current_user.username,
        created_at=ev.created_at,
    )


@router.post("/{port_id}/attachments/paste", response_model=EvidenceRead, status_code=201)
def paste_port_screenshot(
    port_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")
    try:
        require_lock(db, port.host.project_id, "port", port_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    base = os.path.join(settings.attachments_dir, "evidence", "port", str(port_id))
    os.makedirs(base, exist_ok=True)
    fname = f"{uuid_mod.uuid4().hex}.png"
    path = os.path.join(base, fname)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    size = os.path.getsize(path)
    ev = Evidence(
        project_id=port.host.project_id,
        host_id=port.host_id,
        port_id=port_id,
        filename="Pasted Screenshot",
        mime=file.content_type or "image/png",
        size=size,
        stored_path=path,
        is_pasted=True,
        created_by_user_id=current_user.id,
    )
    db.add(ev)
    log_audit(
        db,
        project_id=port.host.project_id,
        user_id=current_user.id,
        action_type="port_screenshot_pasted",
        record_type="port",
        record_id=port_id,
        after_json={"attachment_id": str(ev.id)},
    )
    db.commit()
    db.refresh(ev)
    return EvidenceRead(
        id=ev.id,
        port_id=ev.port_id,
        filename="Pasted Screenshot",
        mime=ev.mime,
        size=ev.size,
        is_pasted=True,
        uploaded_by_username=current_user.username,
        created_at=ev.created_at,
    )


@router.get("/{port_id}/attachments/{att_id}")
def get_port_attachment_file(
    port_id: UUID,
    att_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ev = (
        db.query(Evidence)
        .filter(Evidence.id == att_id, Evidence.port_id == port_id)
        .first()
    )
    if not ev or not ev.stored_path or not os.path.isfile(ev.stored_path):
        raise HTTPException(status_code=404, detail="Attachment not found")
    return FileResponse(
        ev.stored_path,
        filename=ev.filename,
        media_type=ev.mime or "application/octet-stream",
    )


@router.patch("/{port_id}/attachments/{att_id}", response_model=EvidenceRead)
def update_port_attachment_notes(
    port_id: UUID,
    att_id: UUID,
    body: EvidenceNotesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ev = (
        db.query(Evidence)
        .options(joinedload(Evidence.uploaded_by))
        .filter(Evidence.id == att_id, Evidence.port_id == port_id)
        .first()
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if body.notes_md is not None:
        ev.notes_md = body.notes_md
    db.commit()
    db.refresh(ev)
    return EvidenceRead(
        id=ev.id,
        port_id=ev.port_id,
        filename=ev.filename,
        caption=ev.caption,
        mime=ev.mime,
        size=ev.size,
        is_pasted=bool(ev.is_pasted),
        source=ev.source,
        notes_md=ev.notes_md,
        uploaded_by_username=ev.uploaded_by.username if ev.uploaded_by else None,
        created_at=ev.created_at,
    )


@router.delete("/{port_id}/attachments/{att_id}", status_code=204)
def delete_port_attachment(
    port_id: UUID,
    att_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")
    try:
        require_lock(db, port.host.project_id, "port", port_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    ev = db.query(Evidence).filter(Evidence.id == att_id, Evidence.port_id == port_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if ev.stored_path and os.path.isfile(ev.stored_path):
        os.remove(ev.stored_path)
    log_audit(
        db,
        project_id=port.host.project_id,
        user_id=current_user.id,
        action_type="port_attachment_removed",
        record_type="port",
        record_id=port_id,
        before_json={"attachment_id": str(ev.id), "filename": ev.filename},
    )
    db.delete(ev)
    db.commit()
    return None
