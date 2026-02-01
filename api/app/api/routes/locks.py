from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.ws import manager as ws_manager
from app.db.session import get_db
from app.models.models import Lock, User
from app.schemas.lock import LockCreate, LockRead
from app.services.lock import (
    acquire_lock,
    list_locks_for_project,
    release_lock,
    renew_lock,
)

router = APIRouter()


def _lock_to_read(lock: Lock) -> LockRead:
    username = lock.locked_by.username if lock.locked_by else None
    return LockRead(
        id=lock.id,
        project_id=lock.project_id,
        record_type=lock.record_type,
        record_id=lock.record_id,
        locked_by_user_id=lock.locked_by_user_id,
        locked_by_username=username,
        locked_at=lock.locked_at,
        expires_at=lock.expires_at,
    )


@router.post("", response_model=LockRead, status_code=201)
async def create_lock(
    body: LockCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Acquire a lock on a record."""
    try:
        lock = acquire_lock(
            db,
            body.project_id,
            body.record_type,
            body.record_id,
            current_user,
        )
        payload = {
            "project_id": str(lock.project_id),
            "record_type": lock.record_type,
            "record_id": str(lock.record_id),
            "locked_by_user_id": str(lock.locked_by_user_id),
            "locked_by_username": lock.locked_by.username if lock.locked_by else None,
            "lock_id": str(lock.id),
            "expires_at": lock.expires_at.isoformat(),
        }
        await ws_manager.broadcast_lock_changed(lock.project_id, "acquired", payload)
        return _lock_to_read(lock)
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("", response_model=list[LockRead])
def list_locks(
    project_id: UUID = Query(..., description="Filter by project"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List active locks for a project."""
    locks = list_locks_for_project(db, project_id)
    return [_lock_to_read(l) for l in locks]


@router.delete("/{lock_id}", status_code=204)
async def delete_lock(
    lock_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Release a lock."""
    lock = db.query(Lock).filter(Lock.id == lock_id).first()
    if not lock or lock.locked_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lock not found or not owned by you",
        )
    project_id = lock.project_id
    record_type = lock.record_type
    record_id = lock.record_id
    if not release_lock(db, lock_id, current_user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lock not found or not owned by you",
        )
    payload = {
        "project_id": str(project_id),
        "record_type": record_type,
        "record_id": str(record_id),
    }
    await ws_manager.broadcast_lock_changed(project_id, "released", payload)
    return None


@router.post("/{lock_id}/renew", response_model=LockRead)
async def renew_lock_endpoint(
    lock_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Renew a lock, extending its expiry."""
    lock = renew_lock(db, lock_id, current_user)
    if not lock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lock not found, expired, or not owned by you",
        )
    payload = {
        "project_id": str(lock.project_id),
        "record_type": lock.record_type,
        "record_id": str(lock.record_id),
        "lock_id": str(lock.id),
        "expires_at": lock.expires_at.isoformat(),
    }
    await ws_manager.broadcast_lock_changed(lock.project_id, "renewed", payload)
    return _lock_to_read(lock)
