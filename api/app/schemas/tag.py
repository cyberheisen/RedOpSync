from uuid import UUID

from pydantic import BaseModel, Field


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    color: str | None = Field(None, max_length=32)


class TagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    color: str | None = Field(None, max_length=32)


class TagRead(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    color: str | None

    model_config = {"from_attributes": True}


class ItemTagCreate(BaseModel):
    tag_id: UUID
    target_type: str = Field(..., pattern="^(host|port|port_evidence|vuln_definition)$")
    target_id: UUID


class ItemTagAssignment(BaseModel):
    """One target for bulk tag assignment."""

    target_type: str = Field(..., pattern="^(host|port|port_evidence|vuln_definition)$")
    target_id: UUID


class ItemTagBulkCreate(BaseModel):
    tag_id: UUID
    assignments: list[ItemTagAssignment]


class ItemTagBulkResponse(BaseModel):
    created: int
    skipped: int


class ItemTagRead(BaseModel):
    id: UUID
    tag_id: UUID
    target_type: str
    target_id: UUID
    tag_name: str | None = None
    tag_color: str | None = None

    model_config = {"from_attributes": True}
