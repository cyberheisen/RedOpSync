"""
GoWitness output parser for directory-based import.

Supported formats:
- Directory with *.png screenshots (primary)
- Optional metadata: .json alongside .png (same basename), or .jsonl in root
- Parses URL to extract host, port, protocol
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

GOWITNESS_SOURCE = "gowitness"


@dataclass
class ParsedURL:
    """Parsed URL components."""

    host: str  # IP or hostname
    port: int
    protocol: str  # http or https
    is_ip: bool
    hostname: str | None  # DNS name if host is IP and we have it, else from URL
    raw_url: str


@dataclass
class GoWitnessRecord:
    """Single GoWitness record (screenshot + optional metadata)."""

    screenshot_path: Path | None  # None when JSONL-only (no screenshot file)
    url: str | None = None
    final_url: str | None = None
    response_code: int | None = None
    title: str | None = None
    server_header: str | None = None
    redirect_chain: list[str] | None = None
    technologies: list[str] | None = None  # e.g. ["HTTP/3", "Google Web Server"]
    parsed: ParsedURL | None = None
    metadata_path: Path | None = None


@dataclass
class ParseResult:
    """Result of parsing a GoWitness directory."""

    records: list[GoWitnessRecord] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    root_name: str = ""


def _normalize_host(host: str) -> str:
    """Strip leading/trailing dots from hostname (e.g. from filename encoding)."""
    if not host:
        return host
    return host.strip(".")


def _parse_url(url: str) -> ParsedURL | None:
    """Parse URL to extract host, port, protocol."""
    try:
        u = urlparse(url)
        if not u.hostname:
            return None
        host = _normalize_host(u.hostname)
        port = u.port
        scheme = (u.scheme or "http").lower()
        if scheme not in ("http", "https"):
            scheme = "https" if port == 443 else "http"
        if port is None:
            port = 443 if scheme == "https" else 80
        is_ip = bool(re.match(r"^[\d.]+\Z", host) or ":" in host)
        hostname = None if is_ip else host
        return ParsedURL(
            host=host,
            port=port,
            protocol=scheme,
            is_ip=is_ip,
            hostname=hostname,
            raw_url=url,
        )
    except Exception:
        return None


def _extract_metadata_from_json(path: Path) -> dict:
    """Load metadata from JSON file."""
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        if isinstance(data, dict):
            return data
        return {}
    except Exception:
        return {}


def _extract_server_from_headers(headers: list | dict) -> str | None:
    """Extract Server header from Headers array or dict.
    Supports: {Key,Value}, {key,value}, or plain {k:v}.
    """
    if isinstance(headers, list):
        for h in headers:
            if isinstance(h, dict):
                k = (h.get("Key") or h.get("key") or "").lower()
                if k == "server":
                    val = h.get("Value") or h.get("value") or ""
                    return str(val).strip() or None
    if isinstance(headers, dict):
        for k, v in headers.items():
            if str(k).lower() == "server" and v:
                return str(v).strip()
    return None


def _extract_technologies(meta: dict) -> list[str] | None:
    """Extract technologies list from metadata. e.g. [{"value":"HTTP/3"}, ...]"""
    tech = meta.get("technologies") or meta.get("Technologies")
    if not isinstance(tech, list) or not tech:
        return None
    result: list[str] = []
    for t in tech:
        if isinstance(t, dict):
            v = t.get("Value") or t.get("value") or t.get("name")
            if v and str(v).strip():
                result.append(str(v).strip())
        elif isinstance(t, str) and t.strip():
            result.append(t.strip())
    return result if result else None


def _filename_to_url_guess(filename: str) -> str | None:
    """Guess URL from common GoWitness filename patterns.
    e.g. https-example-com.png, http-10-0-0-1.png, http-10-0-0-1-8080.png
    """
    base = Path(filename).stem
    if "-" not in base:
        return None
    parts = base.split("-")
    if len(parts) < 2:
        return None
    scheme = parts[0].lower()
    if scheme not in ("http", "https"):
        return None
    rest = "-".join(parts[1:])
    last = rest.rsplit("-", 1)[-1] if "-" in rest else ""
    port_suffix = int(last) if last.isdigit() and len(last) <= 5 else None
    if port_suffix is not None and 1 <= port_suffix <= 65535:
        rest = rest[: -len(last) - 1]
    host_part = _normalize_host(rest.replace("-", "."))
    if not host_part:
        return None
    if re.match(r"^[\d.]+$", host_part):
        if port_suffix is not None:
            return f"{scheme}://{host_part}:{port_suffix}/"
        return f"{scheme}://{host_part}/"
    if port_suffix is not None:
        return f"{scheme}://{host_part}:{port_suffix}/"
    return f"{scheme}://{host_part}/"


_IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg")


def _collect_screenshots_and_json(root: Path) -> list[tuple[Path, Path | None]]:
    """Collect (screenshot_path, json_path or None) for PNG/JPEG screenshots."""
    result: list[tuple[Path, Path | None]] = []
    seen: set[Path] = set()
    for ext in _IMAGE_SUFFIXES:
        for p in root.rglob(f"*{ext}"):
            if not p.is_file() or p in seen:
                continue
            seen.add(p)
            json_path = p.with_suffix(".json")
            meta = json_path if json_path.is_file() else None
            result.append((p, meta))
    return result


def _load_jsonl(path: Path) -> list[dict]:
    """Load JSONL file - one JSON object per line."""
    records: list[dict] = []
    try:
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    except Exception:
        pass
    return records


def _match_jsonl_to_screenshots(
    jsonl_records: list[dict], screenshot_paths: list[Path], root: Path
) -> dict[str, dict]:
    """Match JSONL records to screenshot paths by Filename, file_name, or stem."""
    by_filename: dict[str, dict] = {}
    by_stem: dict[str, dict] = {}
    for rec in jsonl_records:
        fn = rec.get("Filename") or rec.get("filename") or rec.get("file_name") or ""
        if fn:
            by_filename[fn] = rec
            stem = Path(fn).stem
            if stem and stem not in by_stem:
                by_stem[stem] = rec
    result: dict[str, dict] = {}
    for p in screenshot_paths:
        name = p.name
        stem = p.stem
        meta = by_filename.get(name)
        if not meta:
            try:
                rel = str(p.relative_to(root))
                meta = by_filename.get(rel)
            except ValueError:
                pass
        if not meta and stem:
            meta = by_stem.get(stem)
        if meta:
            result[str(p)] = meta
    return result


def _record_from_metadata(meta: dict, screenshot_path: Path | None, json_path: Path | None) -> GoWitnessRecord | None:
    """Build GoWitnessRecord from metadata dict. Returns None if URL missing/invalid."""
    url = meta.get("URL") or meta.get("url")
    if not url and screenshot_path:
        url = _filename_to_url_guess(screenshot_path.name)
    if not url:
        return None

    parsed = _parse_url(url)
    if not parsed:
        return None

    final_url = meta.get("FinalURL") or meta.get("final_url") or url
    resp = meta.get("ResponseCode") or meta.get("response_code")
    title = meta.get("Title") or meta.get("title")
    headers = meta.get("Headers") or meta.get("headers") or []
    server = _extract_server_from_headers(headers) or meta.get("Server") or meta.get("server")
    redirects = meta.get("RedirectChain") or meta.get("redirect_chain")
    if isinstance(redirects, str):
        redirects = [redirects] if redirects else None
    technologies = _extract_technologies(meta)

    return GoWitnessRecord(
        screenshot_path=screenshot_path,
        url=url,
        final_url=final_url,
        response_code=int(resp) if resp is not None else None,
        title=title,
        server_header=server,
        redirect_chain=redirects,
        technologies=technologies,
        parsed=parsed,
        metadata_path=json_path,
    )


def parse_gowitness_directory(root: Path) -> ParseResult:
    """
    Parse a GoWitness output directory.

    Supports:
    - *.png, *.jpg, *.jpeg files (screenshots)
    - *.json alongside screenshots (metadata per screenshot)
    - *.jsonl (metadata; matches by Filename/filename/file_name or stem)
    - JSONL-only: if no screenshots, creates records from JSONL entries with url

    Returns ParseResult with records and any non-fatal errors.
    """
    result = ParseResult(root_name=root.name or str(root))

    if not root.is_dir():
        result.errors.append("Input is not a valid directory")
        return result

    pairs = _collect_screenshots_and_json(root)
    jsonl_files = list(root.rglob("*.jsonl"))
    jsonl_records: list[dict] = []
    for jf in jsonl_files:
        jsonl_records.extend(_load_jsonl(jf))

    jsonl_meta: dict[str, dict] = {}
    if jsonl_records and pairs:
        screenshot_paths = [p for p, _ in pairs]
        matched = _match_jsonl_to_screenshots(jsonl_records, screenshot_paths, root)
        jsonl_meta = matched

    if pairs:
        for screenshot_path, json_path in pairs:
            try:
                meta: dict = {}
                if json_path:
                    meta = _extract_metadata_from_json(json_path)
                if not meta and str(screenshot_path) in jsonl_meta:
                    meta = jsonl_meta[str(screenshot_path)]

                record = _record_from_metadata(meta, screenshot_path, json_path)
                if record:
                    result.records.append(record)
                else:
                    url = meta.get("URL") or meta.get("url") or _filename_to_url_guess(screenshot_path.name)
                    result.errors.append(f"Could not determine/parse URL for {screenshot_path.name}: {url or 'missing'}")
            except Exception as e:
                result.errors.append(f"Error processing {screenshot_path.name}: {e}")
    elif jsonl_records:
        for rec in jsonl_records:
            try:
                record = _record_from_metadata(rec, None, None)
                if record:
                    result.records.append(record)
            except Exception as e:
                url = rec.get("url") or rec.get("URL") or "unknown"
                result.errors.append(f"Error processing JSONL record {url}: {e}")

    if not result.records and not pairs and not jsonl_records:
        result.errors.append("No PNG/JPEG screenshots or JSONL metadata found in directory")
    elif not result.records:
        result.errors.append("No valid records could be parsed from screenshots or JSONL")

    return result
