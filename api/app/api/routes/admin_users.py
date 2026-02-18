"""Admin users API."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.admin_deps import require_admin
from app.core.deps import get_current_user
from app.core.security import hash_password
from app.db.session import get_db
from app.models.models import User
from app.schemas.admin_user import AdminUserCreate, AdminUserRead, AdminUserResetPassword, AdminUserUpdate
from app.services.audit import log_audit

router = APIRouter()


def _role_str(role) -> str:
    return role.value if hasattr(role, "value") else str(role)


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.get("", response_model=list[AdminUserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List all users (admin only)."""
    users = db.query(User).order_by(User.username).all()
    return [
        AdminUserRead(
            id=u.id,
            username=u.username,
            role=_role_str(u.role),
            created_at=u.created_at,
            disabled_at=u.disabled_at,
        )
        for u in users
    ]


@router.post("", response_model=AdminUserRead, status_code=201)
def create_user(
    body: AdminUserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Create a new user (admin only)."""
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    role_value = "user" if body.role == "operator" else "admin"
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=role_value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_audit(
        db,
        user_id=current_user.id,
        action_type="create_user",
        record_type="user",
        record_id=user.id,
        after_json={"username": user.username, "role": role_value},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return AdminUserRead(
        id=user.id,
        username=user.username,
        role=role_value,
        created_at=user.created_at,
        disabled_at=user.disabled_at,
    )


@router.patch("/{user_id}", response_model=AdminUserRead)
def update_user(
    user_id: UUID,
    body: AdminUserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update a user (admin only). Username, password, and role are optional."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    data = body.model_dump(exclude_unset=True)
    if "username" in data:
        existing = db.query(User).filter(User.username == data["username"], User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
        user.username = data["username"]
    if "password" in data and data["password"]:
        user.password_hash = hash_password(data["password"])
    if "role" in data:
        role_value = "user" if data["role"] == "operator" else "admin"
        role_val = _role_str(user.role)
        if role_val == "admin" and role_value == "user":
            admin_count = db.query(User).filter(User.role == "admin").count()
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last remaining admin")
        user.role = role_value
    log_audit(
        db,
        user_id=current_user.id,
        action_type="update_user",
        record_type="user",
        record_id=user.id,
        after_json={"username": user.username, "role": _role_str(user.role)},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return AdminUserRead(
        id=user.id,
        username=user.username,
        role=_role_str(user.role),
        created_at=user.created_at,
        disabled_at=user.disabled_at,
    )


@router.post("/{user_id}/disable", status_code=200)
def disable_user(
    user_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Disable a user (admin only)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot disable yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.disabled_at:
        raise HTTPException(status_code=400, detail="User already disabled")
    role_val = _role_str(user.role)
    if role_val == "admin":
        raise HTTPException(status_code=400, detail="Admin accounts cannot be disabled")
    from datetime import datetime, timezone

    user.disabled_at = datetime.now(timezone.utc)
    log_audit(
        db,
        user_id=current_user.id,
        action_type="disable_user",
        record_type="user",
        record_id=user.id,
        after_json={"username": user.username},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return {"ok": True}


@router.post("/{user_id}/enable", status_code=200)
def enable_user(
    user_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Enable a disabled user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.disabled_at:
        raise HTTPException(status_code=400, detail="User is not disabled")
    user.disabled_at = None
    log_audit(
        db,
        user_id=current_user.id,
        action_type="enable_user",
        record_type="user",
        record_id=user.id,
        after_json={"username": user.username},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return {"ok": True}


@router.post("/{user_id}/reset-password", status_code=200)
def reset_password(
    user_id: UUID,
    body: AdminUserResetPassword,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Reset user password (admin only). User will be prompted to change password on next login."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(body.temporary_password)
    user.must_change_password = True
    log_audit(
        db,
        user_id=current_user.id,
        action_type="reset_password",
        record_type="user",
        record_id=user.id,
        after_json={"username": user.username},
        ip_address=_get_client_ip(request),
    )
    db.commit()
    return {"ok": True}


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete a user (admin only). Cannot delete self."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role_val = _role_str(user.role)
    if role_val == "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last remaining admin")
    username = user.username
    log_audit(
        db,
        user_id=current_user.id,
        action_type="delete_user",
        record_type="user",
        record_id=user.id,
        before_json={"username": username},
        ip_address=_get_client_ip(request),
    )
    db.delete(user)
    db.commit()
    return None
