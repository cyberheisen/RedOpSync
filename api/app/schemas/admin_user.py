"""Admin user management schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AdminUserRead(BaseModel):
    id: UUID
    username: str
    role: str
    created_at: datetime
    disabled_at: datetime | None

    model_config = {"from_attributes": True}


class AdminUserCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8)
    role: str = Field(..., pattern="^(admin|operator)$")


class AdminUserResetPassword(BaseModel):
    temporary_password: str = Field(..., min_length=8)


class AdminUserUpdate(BaseModel):
    username: str | None = Field(None, min_length=1, max_length=255)
    password: str | None = Field(None, min_length=8)
    role: str | None = Field(None, pattern="^(admin|operator)$")
