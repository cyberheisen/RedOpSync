from datetime import datetime
from uuid import UUID
from typing import Sequence

from pydantic import BaseModel, Field


class HostCreate(BaseModel):
    project_id: UUID
    subnet_id: UUID | None = None
    ip: str = Field(..., min_length=1, max_length=45)
    dns_name: str | None = Field(None, max_length=255)
    tags: Sequence[str] | None = None
    status: str | None = Field(None, max_length=64)


class HostUpdate(BaseModel):
    subnet_id: UUID | None = None
    ip: str | None = Field(None, min_length=1, max_length=45)
    dns_name: str | None = Field(None, max_length=255)
    tags: Sequence[str] | None = None
    status: str | None = Field(None, max_length=64)


class HostRead(BaseModel):
    id: UUID
    project_id: UUID
    subnet_id: UUID | None
    ip: str
    dns_name: str | None
    tags: list[str] | None
    status: str | None
    whois_data: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
