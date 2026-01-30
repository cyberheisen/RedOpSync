from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SubnetCreate(BaseModel):
    project_id: UUID
    cidr: str = Field(..., min_length=1, max_length=64)
    name: str | None = None


class SubnetUpdate(BaseModel):
    cidr: str | None = Field(None, min_length=1, max_length=64)
    name: str | None = None


class SubnetRead(BaseModel):
    id: UUID
    project_id: UUID
    cidr: str
    name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
