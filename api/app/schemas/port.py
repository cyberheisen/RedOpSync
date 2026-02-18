from datetime import datetime
from uuid import UUID
from typing import Literal

from pydantic import BaseModel, Field


class PortCreate(BaseModel):
    host_id: UUID
    protocol: Literal["tcp", "udp"]
    number: int = Field(..., ge=1, le=65535)
    state: str | None = Field(None, max_length=32)
    service_name: str | None = Field(None, max_length=255)
    service_version: str | None = Field(None, max_length=255)
    banner: str | None = None
    description_md: str | None = None
    evidence_md: str | None = None
    discovered_by: str | None = Field(None, max_length=64)


class PortUpdate(BaseModel):
    state: str | None = Field(None, max_length=32)
    service_name: str | None = Field(None, max_length=255)
    service_version: str | None = Field(None, max_length=255)
    banner: str | None = None
    description_md: str | None = None
    evidence_md: str | None = None
    discovered_by: str | None = Field(None, max_length=64)


class PortRead(BaseModel):
    id: UUID
    host_id: UUID
    protocol: str
    number: int
    state: str | None
    service_name: str | None
    service_version: str | None
    banner: str | None
    description_md: str | None
    evidence_md: str | None
    discovered_by: str | None
    scanned_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PortAttachmentSummary(BaseModel):
    id: UUID
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


class PortReadWithAttachments(PortRead):
    attachments: list[PortAttachmentSummary] = []
