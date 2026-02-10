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


def _is_secure_request(request: Request) -> bool:
    """True if the client sees this as HTTPS (or localhost, which browsers treat as secure)."""
    proto = request.headers.get("x-forwarded-proto", "").strip().lower()
    if proto == "https":
        return True
    host = (request.headers.get("host") or "").split(":")[0].lower()
    if host in ("localhost", "127.0.0.1"):
        return True
    return False


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
    # On HTTPS or localhost: Secure + SameSite=None so cookie is sent cross-origin (e.g. :3000 -> :8000).
    # On HTTP (e.g. another machine at http://ip:8000): Secure=False so the cookie is stored; SameSite=Lax
    # still sends it for same host different port (same site).
    secure = _is_secure_request(request)
    response.set_cookie(
        key=TOKEN_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite="none" if secure else "lax",
        max_age=settings.jwt_expire_hours * 3600,
        path="/",
    )
    sess = SessionModel(user_id=user.id, ip_address=_get_client_ip(request))
    db.add(sess)
    db.commit()
    return LoginResponse(user=UserRead(id=user.id, username=user.username, role=_role_str(user.role)))


@router.post("/logout")
def logout(request: Request, response: Response):
    secure = _is_secure_request(request)
    response.delete_cookie(
        key=TOKEN_COOKIE_NAME, path="/", secure=secure, samesite="none" if secure else "lax"
    )
    return {"ok": True}


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return UserRead(id=current_user.id, username=current_user.username, role=_role_str(current_user.role))


@router.get("/users", response_model=list[UserRead])
def list_users(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List users (for assignee dropdowns). Any authenticated user can list."""
    users = db.query(User).filter(User.disabled_at.is_(None)).order_by(User.username).all()
    return [UserRead(id=u.id, username=u.username, role=_role_str(u.role)) for u in users]
