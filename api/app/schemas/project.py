from datetime import datetime
from uuid import UUID
from typing import Any

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    countdown_red_days_default: int = Field(default=7, ge=1, le=365)
    scope_policy: dict[str, Any] | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    countdown_red_days_default: int | None = Field(None, ge=1, le=365)
    scope_policy: dict[str, Any] | None = None


class ProjectRead(BaseModel):
    id: UUID
    name: str
    description: str | None
    start_date: datetime | None
    end_date: datetime | None
    countdown_red_days_default: int
    scope_policy: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
