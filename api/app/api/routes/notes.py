from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import Note, User
from app.schemas.note import NoteRead

router = APIRouter()


@router.get("", response_model=list[NoteRead])
def list_notes(
    project_id: UUID | None = Query(None),
    host_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Note)
    if project_id is not None:
        q = q.filter(Note.project_id == project_id)
    if host_id is not None:
        q = q.filter(Note.host_id == host_id)
    return q.order_by(Note.updated_at.desc()).all()
