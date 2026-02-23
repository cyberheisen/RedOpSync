"""
Store for async import jobs. Used when import-from-path/upload returns 202
and the client polls for status and progress.

Uses Redis when available so all API workers share job state (avoids "job not found"
when the poll hits a different worker). Falls back to in-memory for single-process dev.
"""
from __future__ import annotations

import json
import logging
import threading
import uuid
from typing import Any
from uuid import UUID

from app.core.config import settings

logger = logging.getLogger(__name__)

JOB_TTL_SECONDS = 3600  # 1 hour

_redis_client: "redis.Redis | None" = None
_redis_available: bool | None = None
_memory_store: dict[str, dict] = {}
_memory_lock = threading.Lock()


def _get_redis():
    global _redis_client, _redis_available
    if _redis_available is False:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        import redis
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
        _redis_client.ping()
        _redis_available = True
        return _redis_client
    except Exception as e:
        logger.warning("Redis unavailable for import job store, using in-memory fallback: %s", e)
        _redis_available = False
        return None


def _key(job_id: str) -> str:
    return f"import_job:{job_id}"


def create_job(project_id: UUID) -> str:
    """Create a new job for the given project. Returns job_id."""
    job_id = str(uuid.uuid4())
    job = {
        "project_id": str(project_id),
        "status": "running",
        "progress": None,
        "result": None,
        "error": None,
    }
    r = _get_redis()
    if r is not None:
        try:
            r.set(_key(job_id), json.dumps(job), ex=JOB_TTL_SECONDS)
            return job_id
        except Exception as e:
            logger.warning("Redis set failed, using in-memory: %s", e)
    with _memory_lock:
        _memory_store[job_id] = job
    return job_id


def get_job(job_id: str, project_id: UUID) -> dict | None:
    """Return job state if it exists and belongs to the project."""
    r = _get_redis()
    if r is not None:
        try:
            raw = r.get(_key(job_id))
            if raw is None:
                return None
            job = json.loads(raw)
            if job.get("project_id") != str(project_id):
                return None
            return dict(job)
        except Exception as e:
            logger.warning("Redis get failed: %s", e)
    with _memory_lock:
        job = _memory_store.get(job_id)
        if not job or job["project_id"] != str(project_id):
            return None
        return dict(job)


def _update_job(job_id: str, updater: object) -> None:
    """Apply updater to job dict and persist. updater is a callable that takes the job dict and mutates it."""
    r = _get_redis()
    if r is not None:
        try:
            raw = r.get(_key(job_id))
            if raw is None:
                return
            job = json.loads(raw)
            if callable(updater):
                updater(job)
            else:
                job.update(updater)
            r.set(_key(job_id), json.dumps(job), ex=JOB_TTL_SECONDS)
            return
        except Exception as e:
            logger.warning("Redis update failed: %s", e)
    with _memory_lock:
        if job_id in _memory_store:
            if callable(updater):
                updater(_memory_store[job_id])
            else:
                _memory_store[job_id].update(updater)


def set_progress(
    job_id: str,
    current: int,
    total: int,
    summary: dict[str, Any] | None = None,
) -> None:
    """Update job progress (e.g. records processed)."""
    def updater(job: dict) -> None:
        if job.get("status") == "running":
            job["progress"] = {
                "current": current,
                "total": total,
                "summary": summary,
            }
    _update_job(job_id, updater)


def set_result(job_id: str, result: dict) -> None:
    """Mark job as completed with result."""
    def updater(job: dict) -> None:
        job["status"] = "completed"
        job["result"] = result
        job["progress"] = None
    _update_job(job_id, updater)


def set_failed(job_id: str, error: str) -> None:
    """Mark job as failed with error message."""
    def updater(job: dict) -> None:
        job["status"] = "failed"
        job["error"] = error
        job["progress"] = None
    _update_job(job_id, updater)
