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


SORT_MODE_VALUES = ("cidr_asc", "cidr_desc", "alpha_asc", "alpha_desc", "last_seen_desc")


class ProjectSortModeUpdate(BaseModel):
    sort_mode: str = Field(..., pattern="^(cidr_asc|cidr_desc|alpha_asc|alpha_desc|last_seen_desc)$")


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    countdown_red_days_default: int | None = Field(None, ge=1, le=365)
    scope_policy: dict[str, Any] | None = None
    sort_mode: str | None = Field(None, pattern="^(cidr_asc|cidr_desc|alpha_asc|alpha_desc|last_seen_desc)$")


class ProjectRead(BaseModel):
    id: UUID
    name: str
    description: str | None
    start_date: datetime | None
    end_date: datetime | None
    countdown_red_days_default: int
    scope_policy: dict[str, Any] | None
    sort_mode: str
    created_at: datetime

    model_config = {"from_attributes": True}
