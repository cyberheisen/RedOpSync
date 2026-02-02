from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class EvidenceRead(BaseModel):
    id: UUID
    port_id: UUID | None
    filename: str
    mime: str | None
    size: int | None
    is_pasted: bool
    uploaded_by_username: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
