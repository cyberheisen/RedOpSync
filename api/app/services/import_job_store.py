"""
In-memory store for async import jobs. Used when import-from-path/upload returns 202
and the client polls for status and progress.
"""
from __future__ import annotations

import threading
import uuid
from typing import Any
from uuid import UUID


_store: dict[str, dict] = {}
_lock = threading.Lock()


def create_job(project_id: UUID) -> str:
    """Create a new job for the given project. Returns job_id."""
    job_id = str(uuid.uuid4())
    with _lock:
        _store[job_id] = {
            "project_id": str(project_id),
            "status": "running",
            "progress": None,
            "result": None,
            "error": None,
        }
    return job_id


def get_job(job_id: str, project_id: UUID) -> dict | None:
    """Return job state if it exists and belongs to the project."""
    with _lock:
        job = _store.get(job_id)
        if not job or job["project_id"] != str(project_id):
            return None
        return dict(job)


def set_progress(
    job_id: str,
    current: int,
    total: int,
    summary: dict[str, Any] | None = None,
) -> None:
    """Update job progress (e.g. records processed)."""
    with _lock:
        if job_id in _store and _store[job_id]["status"] == "running":
            _store[job_id]["progress"] = {
                "current": current,
                "total": total,
                "summary": summary,
            }


def set_result(job_id: str, result: dict) -> None:
    """Mark job as completed with result."""
    with _lock:
        if job_id in _store:
            _store[job_id]["status"] = "completed"
            _store[job_id]["result"] = result
            _store[job_id]["progress"] = None


def set_failed(job_id: str, error: str) -> None:
    """Mark job as failed with error message."""
    with _lock:
        if job_id in _store:
            _store[job_id]["status"] = "failed"
            _store[job_id]["error"] = error
            _store[job_id]["progress"] = None
