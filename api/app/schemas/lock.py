from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LockCreate(BaseModel):
    project_id: UUID
    record_type: str = Field(..., pattern="^(host|port|subnet|note|vulnerability_instance|vulnerability_definition)$")
    record_id: UUID


class LockRead(BaseModel):
    id: UUID
    project_id: UUID
    record_type: str
    record_id: UUID
    locked_by_user_id: UUID
    locked_by_username: str | None = None
    locked_at: datetime
    expires_at: datetime

    model_config = {"from_attributes": True}


class LockListQuery(BaseModel):
    project_id: UUID
