from datetime import datetime, timezone, timedelta
from uuid import UUID

import bcrypt
import jwt

from app.core.config import settings

TOKEN_COOKIE_NAME = "redopsync_session"

# bcrypt has a 72-byte limit; longer passwords are rejected to avoid silent truncation
BCRYPT_MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    encoded = password.encode("utf-8")
    if len(encoded) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError("Password is too long (max 72 bytes).")
    return bcrypt.hashpw(encoded, bcrypt.gensalt()).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: UUID, username: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=settings.jwt_expire_hours)
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(
        payload,
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.PyJWTError:
        return None
