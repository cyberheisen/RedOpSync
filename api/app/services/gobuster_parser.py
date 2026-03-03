"""
Gobuster directory scan output parser.

Supports:
- Text output (default console): [+], Url:, path lines with (Status: NNN) [Size: N]
- JSON output (-o json when supported): url, results array, optional command, starttime
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

GOBUSTER_SOURCE = "gobuster"


@dataclass
class GobusterPath:
    """Single path result from Gobuster."""

    path: str
    status: int
    size: int | None
    full_url: str  # base_url normalized + path, for display as caption


@dataclass
class GobusterParseResult:
    """Result of parsing Gobuster output."""

    base_url: str
    host: str
    port: int
    paths: list[GobusterPath] = field(default_factory=list)
    command: str | None = None
    started_at: str | None = None
    errors: list[str] = field(default_factory=list)


# Text: path line like "/admin                (Status: 301) [Size: 0]"
_TEXT_PATH_RE = re.compile(
    r"^\s*(/[^\s]*)\s+\(Status:\s*(\d+)\)\s*(?:\[Size:\s*(\d+)\])?\s*$"
)
_TEXT_URL_RE = re.compile(r"\[\+\]\s*Url:\s*(\S+)")


def is_gobuster_text_content(content: bytes) -> bool:
    """True if content looks like Gobuster text output."""
    try:
        text = content.decode("utf-8", errors="replace")
    except Exception:
        return False
    return "Gobuster" in text and "[+] Url:" in text and "(Status:" in text


def is_gobuster_json_content(content: bytes) -> bool:
    """True if content is JSON that looks like Gobuster output."""
    try:
        data = json.loads(content.decode("utf-8"))
    except Exception:
        return False
    if not isinstance(data, dict):
        return False
    # Expect url and either results or result list
    if "url" not in data and "URL" not in data:
        return False
    return "results" in data or "Results" in data or "result" in data


def is_gobuster_content(content: bytes, filename: str = "") -> bool:
    """True if content appears to be Gobuster output (text or JSON)."""
    fn = (filename or "").lower()
    if fn.endswith(".json"):
        return is_gobuster_json_content(content)
    return is_gobuster_text_content(content)


def _parse_url_to_host_port(base_url: str) -> tuple[str, int]:
    """Parse base URL to host and port. Returns (host, port)."""
    parsed = urlparse(base_url)
    host = parsed.hostname or ""
    port = parsed.port
    if port is not None:
        return host, port
    if parsed.scheme == "https":
        return host, 443
    return host, 80


def _normalize_base_url(base_url: str) -> str:
    """Ensure base URL has no trailing slash for joining paths."""
    return base_url.rstrip("/") or "http://localhost"


def parse_gobuster_text(content: bytes, source_file: str = "") -> GobusterParseResult:
    """Parse Gobuster text output."""
    try:
        text = content.decode("utf-8", errors="replace")
    except Exception as e:
        return GobusterParseResult(
            base_url="",
            host="",
            port=80,
            errors=[f"Could not decode file: {e}"],
        )

    base_url = ""
    paths: list[GobusterPath] = []

    for line in text.splitlines():
        url_m = _TEXT_URL_RE.search(line)
        if url_m:
            base_url = url_m.group(1).strip()
            continue
        path_m = _TEXT_PATH_RE.match(line)
        if path_m:
            path, status_s, size_s = path_m.groups()
            path = path.strip()
            try:
                status = int(status_s)
            except ValueError:
                continue
            size = int(size_s) if size_s else None
            normalized = _normalize_base_url(base_url)
            full_url = f"{normalized}{path}" if path.startswith("/") else f"{normalized}/{path}"
            paths.append(GobusterPath(path=path, status=status, size=size, full_url=full_url))

    if not base_url:
        return GobusterParseResult(
            base_url="",
            host="",
            port=80,
            paths=paths,
            errors=["Could not find [+], Url: in output"],
        )

    host, port = _parse_url_to_host_port(base_url)
    return GobusterParseResult(
        base_url=base_url,
        host=host,
        port=port,
        paths=paths,
        errors=[],
    )


def parse_gobuster_json(content: bytes, source_file: str = "") -> GobusterParseResult:
    """Parse Gobuster JSON output. Tolerates different key casings."""
    try:
        data = json.loads(content.decode("utf-8"))
    except json.JSONDecodeError as e:
        return GobusterParseResult(
            base_url="",
            host="",
            port=80,
            errors=[f"Invalid JSON: {e}"],
        )
    if not isinstance(data, dict):
        return GobusterParseResult(
            base_url="",
            host="",
            port=80,
            errors=["JSON root must be an object"],
        )

    base_url = (data.get("url") or data.get("URL") or "").strip()
    if not base_url:
        return GobusterParseResult(
            base_url="",
            host="",
            port=80,
            errors=["JSON must contain 'url' or 'URL'"],
        )

    command = data.get("command") or data.get("commandline") or data.get("commandLine")
    if isinstance(command, list):
        command = " ".join(str(c) for c in command)
    started_at = (
        data.get("starttime")
        or data.get("startTime")
        or data.get("started_at")
        or data.get("startedAt")
    )

    results = data.get("results") or data.get("Results") or data.get("result") or []
    if not isinstance(results, list):
        results = []

    normalized = _normalize_base_url(base_url)
    paths: list[GobusterPath] = []
    for r in results:
        if not isinstance(r, dict):
            continue
        path = (r.get("path") or r.get("Path") or "").strip()
        if not path:
            continue
        status = r.get("status") or r.get("Status")
        if status is None:
            status = 0
        try:
            status = int(status)
        except (TypeError, ValueError):
            status = 0
        size = r.get("size") or r.get("Size")
        if size is not None:
            try:
                size = int(size)
            except (TypeError, ValueError):
                size = None
        else:
            size = None
        full_url = f"{normalized}{path}" if path.startswith("/") else f"{normalized}/{path}"
        paths.append(GobusterPath(path=path, status=status, size=size, full_url=full_url))

    host, port = _parse_url_to_host_port(base_url)
    return GobusterParseResult(
        base_url=base_url,
        host=host,
        port=port,
        paths=paths,
        command=str(command) if command else None,
        started_at=str(started_at) if started_at else None,
        errors=[],
    )


def parse_gobuster(content: bytes, filename: str = "") -> GobusterParseResult:
    """
    Parse Gobuster output (text or JSON). Detects format from content and filename.
    """
    fn = (filename or "").lower()
    if fn.endswith(".json") or (not fn.endswith(".txt") and is_gobuster_json_content(content)):
        return parse_gobuster_json(content, filename)
    return parse_gobuster_text(content, filename)
