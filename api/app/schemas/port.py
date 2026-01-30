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


class PortUpdate(BaseModel):
    state: str | None = Field(None, max_length=32)
    service_name: str | None = Field(None, max_length=255)
    service_version: str | None = Field(None, max_length=255)
    banner: str | None = None


class PortRead(BaseModel):
    id: UUID
    host_id: UUID
    protocol: str
    number: int
    state: str | None
    service_name: str | None
    service_version: str | None
    banner: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
