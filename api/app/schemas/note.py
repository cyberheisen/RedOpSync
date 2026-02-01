from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NoteRead(BaseModel):
    id: UUID
    project_id: UUID
    host_id: UUID | None
    port_id: UUID | None
    vuln_instance_id: UUID | None
    body_md: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
