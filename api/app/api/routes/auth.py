from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.security import (
    TOKEN_COOKIE_NAME,
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.models import User, Session as SessionModel
from app.schemas.auth import LoginRequest, LoginResponse, UserRead

router = APIRouter()


def _role_str(role) -> str:
    return role.value if hasattr(role, "value") else str(role)


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if user.disabled_at:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account disabled",
        )
    token = create_access_token(
        user.id,
        user.username,
        user.role.value if hasattr(user.role, "value") else user.role,
    )
    response.set_cookie(
        key=TOKEN_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.jwt_expire_hours * 3600,
        path="/",
    )
    sess = SessionModel(user_id=user.id, ip_address=_get_client_ip(request))
    db.add(sess)
    db.commit()
    return LoginResponse(user=UserRead(id=user.id, username=user.username, role=_role_str(user.role)))


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=TOKEN_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return UserRead(id=current_user.id, username=current_user.username, role=_role_str(current_user.role))
