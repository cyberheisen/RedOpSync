import logging
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyCookie
from sqlalchemy.orm import Session

from app.core.security import TOKEN_COOKIE_NAME, decode_access_token
from app.db.session import get_db
from app.models.models import User

logger = logging.getLogger(__name__)
cookie_scheme = APIKeyCookie(name=TOKEN_COOKIE_NAME, auto_error=False)


def get_current_user(
    db: Session = Depends(get_db),
    token: str | None = Depends(cookie_scheme),
) -> User:
    logger.info("auth check: cookie_%s=%s", TOKEN_COOKIE_NAME, "present" if token else "absent")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if user.disabled_at:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account disabled",
        )
    return user
