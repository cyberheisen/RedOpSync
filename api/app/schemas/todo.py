from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TodoCreate(BaseModel):
    project_id: UUID
    title: str = Field(..., min_length=1, max_length=512)
    description: str | None = None
    subnet_id: UUID | None = None
    host_id: UUID | None = None
    port_id: UUID | None = None
    assigned_to_user_id: UUID | None = None
    target_type: str | None = Field(None, pattern="^(scope|subnet|host|host_ports|port|vulnerabilities|vulnerability_definition)$")
    target_id: UUID | None = None


class TodoUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=512)
    description: str | None = None
    status: str | None = Field(None, pattern="^(open|done)$")
    assigned_to_user_id: UUID | None = None


class TodoRead(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    description: str | None = Field(None, alias="body")
    status: str
    subnet_id: UUID | None
    host_id: UUID | None
    port_id: UUID | None
    assigned_to_user_id: UUID | None
    assigned_to_username: str | None
    target_type: str
    target_id: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}
