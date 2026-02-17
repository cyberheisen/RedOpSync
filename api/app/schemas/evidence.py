from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class EvidenceNotesUpdate(BaseModel):
    notes_md: str | None = None


class EvidenceRead(BaseModel):
    id: UUID
    port_id: UUID | None
    filename: str
    caption: str | None = None
    mime: str | None
    size: int | None
    is_pasted: bool
    source: str | None = None
    notes_md: str | None = None
    uploaded_by_username: str | None
    created_at: datetime
    imported_at: datetime | None = None
    source_file: str | None = None
    source_timestamp: str | None = None

    model_config = {"from_attributes": True}
