"""
FFuf directory/file fuzzing output parser.

Supports FFuf JSON output (-of json): results array with url, status, length;
optional commandline and time metadata.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from urllib.parse import urlparse

FFUF_SOURCE = "ffuf"


@dataclass
class FfufPath:
    """Single result from FFuf."""

    path: str
    status: int
    size: int | None
    full_url: str  # full URL for display as caption


@dataclass
class FfufParseResult:
    """Result of parsing FFuf output."""

    base_url: str
    host: str
    port: int
    paths: list[FfufPath] = field(default_factory=list)
    command: str | None = None
    started_at: str | None = None
    errors: list[str] = field(default_factory=list)


def is_ffuf_content(content: bytes, filename: str = "") -> bool:
    """True if content appears to be FFuf JSON output."""
    fn = (filename or "").lower()
    if fn.endswith(".json"):
        return is_ffuf_json_content(content)
    # Allow .txt if content looks like FFuf JSON (e.g. user renamed file)
    try:
        data = json.loads(content.decode("utf-8"))
        return isinstance(data, dict) and "results" in data and isinstance(data.get("results"), list)
    except Exception:
        return False


def is_ffuf_json_content(content: bytes) -> bool:
    """True if content is JSON with FFuf results structure."""
    try:
        data = json.loads(content.decode("utf-8"))
    except Exception:
        return False
    if not isinstance(data, dict):
        return False
    results = data.get("results") or data.get("Results")
    if not isinstance(results, list) or len(results) == 0:
        return False
    first = results[0]
    if not isinstance(first, dict):
        return False
    # FFuf results have 'url' and 'status'
    return "url" in first and "status" in first


def _parse_url_to_host_port(full_url: str) -> tuple[str, int]:
    """Parse URL to host and port. Returns (host, port)."""
    parsed = urlparse(full_url)
    host = parsed.hostname or ""
    port = parsed.port
    if port is not None:
        return host, port
    if parsed.scheme == "https":
        return host, 443
    return host, 80


def _normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/") or "http://localhost"


def parse_ffuf(content: bytes, filename: str = "") -> FfufParseResult:
    """
    Parse FFuf JSON output. Results have url, status, length (optional).
    """
    try:
        data = json.loads(content.decode("utf-8"))
    except json.JSONDecodeError as e:
        return FfufParseResult(
            base_url="",
            host="",
            port=80,
            errors=[f"Invalid JSON: {e}"],
        )
    if not isinstance(data, dict):
        return FfufParseResult(
            base_url="",
            host="",
            port=80,
            errors=["JSON root must be an object"],
        )

    results = data.get("results") or data.get("Results") or []
    if not isinstance(results, list):
        results = []

    if not results:
        return FfufParseResult(
            base_url="",
            host="",
            port=80,
            errors=["FFuf JSON must contain a non-empty 'results' array"],
        )

    command = data.get("commandline") or data.get("command") or data.get("commandLine")
    if isinstance(command, list):
        command = " ".join(str(c) for c in command)
    started_at = (
        data.get("time") or data.get("starttime") or data.get("startTime")
        or data.get("started_at") or data.get("startedAt")
    )

    base_url = ""
    host = ""
    port = 80
    paths: list[FfufPath] = []

    for r in results:
        if not isinstance(r, dict):
            continue
        full_url = (r.get("url") or r.get("URL") or "").strip()
        if not full_url:
            continue
        if not base_url:
            base_url = full_url
            host, port = _parse_url_to_host_port(full_url)
        status = r.get("status") or r.get("Status")
        if status is None:
            status = 0
        try:
            status = int(status)
        except (TypeError, ValueError):
            status = 0
        length = r.get("length") or r.get("Length") or r.get("size") or r.get("Size")
        if length is not None:
            try:
                length = int(length)
            except (TypeError, ValueError):
                length = None
        else:
            length = None
        parsed = urlparse(full_url)
        path = parsed.path or "/"
        paths.append(FfufPath(path=path, status=status, size=length, full_url=full_url))

    if not base_url:
        return FfufParseResult(
            base_url="",
            host="",
            port=80,
            errors=["No valid result entries with 'url' in results array"],
        )

    return FfufParseResult(
        base_url=base_url,
        host=host,
        port=port,
        paths=paths,
        command=str(command) if command else None,
        started_at=str(started_at) if started_at else None,
        errors=[],
    )
