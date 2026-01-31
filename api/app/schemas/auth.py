from uuid import UUID

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserRead(BaseModel):
    id: UUID
    username: str
    role: str

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    user: UserRead
