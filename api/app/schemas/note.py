from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    project_id: UUID
    subnet_id: UUID | None = None
    host_id: UUID | None = None
    port_id: UUID | None = None
    evidence_id: UUID | None = None
    vuln_instance_id: UUID | None = None
    body_md: str | None = None


class NoteUpdate(BaseModel):
    body_md: str | None = Field(None)


class NoteRead(BaseModel):
    id: UUID
    project_id: UUID
    subnet_id: UUID | None
    host_id: UUID | None
    port_id: UUID | None
    evidence_id: UUID | None
    vuln_instance_id: UUID | None
    body_md: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
