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
from app.schemas.auth import ChangePasswordRequest, LoginRequest, LoginResponse, UserRead

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
    # When not behind HTTPS (no x-forwarded-proto=https): use Secure=False and SameSite=Lax so the cookie
    # is stored and sent (e.g. Docker dev at localhost). SameSite=None on HTTP causes browsers to reject the cookie.
    x_proto = (request.headers.get("x-forwarded-proto") or "").strip().lower()
    on_https = x_proto == "https"
    cookie_secure = on_https
    cookie_samesite = "none" if on_https else "lax"
    import logging
    logging.getLogger(__name__).info(
        "login set_cookie: host=%r secure=%s samesite=%s",
        request.headers.get("host"), cookie_secure, cookie_samesite,
    )
    response.set_cookie(
        key=TOKEN_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=cookie_secure,
        samesite=cookie_samesite,
        max_age=settings.jwt_expire_hours * 3600,
        path="/",
    )
    sess = SessionModel(user_id=user.id, ip_address=_get_client_ip(request))
    db.add(sess)
    db.commit()
    return LoginResponse(
        user=UserRead(
            id=user.id,
            username=user.username,
            role=_role_str(user.role),
            must_change_password=getattr(user, "must_change_password", False),
        )
    )


def _cookie_opts(request: Request) -> tuple[bool, str]:
    """(secure, samesite) for cookie. Lax + not Secure when not on HTTPS."""
    x_proto = (request.headers.get("x-forwarded-proto") or "").strip().lower()
    on_https = x_proto == "https"
    return (on_https, "none" if on_https else "lax")


@router.post("/logout")
def logout(request: Request, response: Response):
    secure, samesite = _cookie_opts(request)
    response.delete_cookie(
        key=TOKEN_COOKIE_NAME, path="/", secure=secure, samesite=samesite
    )
    return {"ok": True}


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return UserRead(
        id=current_user.id,
        username=current_user.username,
        role=_role_str(current_user.role),
        must_change_password=getattr(current_user, "must_change_password", False),
    )


@router.post("/change-password", status_code=200)
def change_password(
    body: ChangePasswordRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change current user's password. Clears must_change_password if set."""
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    db.commit()
    db.refresh(current_user)
    return {"ok": True}


@router.get("/users", response_model=list[UserRead])
def list_users(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List users (for assignee dropdowns). Any authenticated user can list."""
    users = db.query(User).filter(User.disabled_at.is_(None)).order_by(User.username).all()
    return [
        UserRead(
            id=u.id,
            username=u.username,
            role=_role_str(u.role),
            must_change_password=getattr(u, "must_change_password", False),
        )
        for u in users
    ]
