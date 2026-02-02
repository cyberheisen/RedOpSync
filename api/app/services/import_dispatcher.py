"""
Import dispatcher: detect scan tool format and route to the appropriate importer.

Supported formats:
- Nmap XML (-oX)
- GoWitness (ZIP with PNG/JPEG and/or JSONL)
- Plain text (.txt) - one host per line: IP [hostname]
"""
from __future__ import annotations

import io
import zipfile
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session

from app.services.gowitness_import import run_gowitness_import as _run_gowitness
from app.services.gowitness_parser import parse_gowitness_directory
from app.services.nmap_import import run_nmap_import as _run_nmap
from app.services.nmap_parser import detect_nmap_format, parse_nmap_xml
from app.services.text_import import run_text_import as _run_text

IMPORT_FORMAT_NMAP = "nmap"
IMPORT_FORMAT_GOWITNESS = "gowitness"
IMPORT_FORMAT_TEXT = "text"


def detect_import_format(content: bytes, filename: str) -> tuple[str | None, str]:
    """
    Detect import format from file content and filename.

    Returns (format, error_message).
    - format: 'nmap' | 'gowitness' | 'text' | None
    - error_message: empty if format detected, else human-readable error
    """
    fn = (filename or "").lower().strip()

    if fn.endswith(".xml"):
        if detect_nmap_format(content, filename) == "xml":
            return IMPORT_FORMAT_NMAP, ""
        try:
            text = content[:500].decode("utf-8", errors="replace")
            if "<nmaprun" in text or "<?xml" in text:
                return None, "File appears to be XML but not valid Nmap format. Ensure it is Nmap XML output (-oX)."
        except Exception:
            pass
        return None, "Invalid or unsupported XML format. Nmap XML (-oX) is required."

    if fn.endswith(".zip"):
        try:
            with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
                names = zf.namelist()
        except zipfile.BadZipFile:
            return None, "Invalid or corrupted ZIP file."

        has_nmap_xml = False
        nmap_xml_name = None
        has_image = any(
            n.lower().endswith(ext) for n in names for ext in (".png", ".jpg", ".jpeg")
        )
        has_jsonl = any(n.lower().endswith(".jsonl") for n in names)

        for n in names:
            if n.lower().endswith(".xml") and not n.startswith("__"):
                try:
                    with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
                        data = zf.read(n)
                    if detect_nmap_format(data, n) == "xml":
                        has_nmap_xml = True
                        break
                except Exception:
                    continue

        if has_nmap_xml:
            return IMPORT_FORMAT_NMAP, ""
        if has_image or has_jsonl:
            return IMPORT_FORMAT_GOWITNESS, ""

        return None, (
            "ZIP contents not recognized. Expected: "
            "Nmap XML (.xml), or GoWitness output (PNG/JPEG screenshots and/or .jsonl)."
        )

    if fn.endswith(".txt"):
        return IMPORT_FORMAT_TEXT, ""

    if fn.endswith(".gnmap"):
        return None, "Grepable format (-oG) is not yet supported. Use Nmap XML (-oX)."
    if fn.endswith(".nmap"):
        return None, "Normal format (-oN) is not yet supported. Use Nmap XML (-oX)."

    if detect_nmap_format(content, filename) == "xml":
        return IMPORT_FORMAT_NMAP, ""

    return None, "Unsupported file format. Use Nmap XML (.xml), GoWitness ZIP (.zip), or plain text (.txt)."


def run_import(
    db: Session,
    project_id: UUID,
    content: bytes,
    filename: str,
    user_id: UUID,
    request_ip: str | None = None,
) -> dict:
    """
    Detect format and run the appropriate importer. Returns unified summary dict.

    Raises ValueError with clear message if format unrecognized or import fails.
    """
    fmt, err = detect_import_format(content, filename)
    if not fmt:
        raise ValueError(err or "Unsupported file format.")

    if fmt == IMPORT_FORMAT_NMAP:
        nmap_content = content
        nmap_filename = filename
        if filename.lower().endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
                for n in zf.namelist():
                    if n.lower().endswith(".xml") and not n.startswith("__"):
                        nmap_content = zf.read(n)
                        nmap_filename = n
                        break
        parse_result = parse_nmap_xml(nmap_content, nmap_filename)
        if parse_result.errors and not parse_result.hosts:
            raise ValueError(
                parse_result.errors[0]
                if len(parse_result.errors) == 1
                else "; ".join(parse_result.errors[:3])
            )
        if not parse_result.hosts:
            return {
                "format": "nmap",
                "hosts_created": 0,
                "hosts_updated": 0,
                "ports_created": 0,
                "ports_updated": 0,
                "evidence_created": 0,
                "errors": parse_result.errors,
            }
        summary = _run_nmap(db, project_id, parse_result, user_id, request_ip)
        return {
            "format": "nmap",
            "hosts_created": summary.hosts_created,
            "hosts_updated": summary.hosts_updated,
            "ports_created": summary.ports_created,
            "ports_updated": summary.ports_updated,
            "evidence_created": summary.evidence_created,
            "errors": summary.errors,
        }

    if fmt == IMPORT_FORMAT_GOWITNESS:
        import tempfile

        with tempfile.TemporaryDirectory(prefix="gowitness_") as tmpdir:
            root = Path(tmpdir)
            with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
                zf.extractall(root)
            parse_result = parse_gowitness_directory(root)
            if not parse_result.records and parse_result.errors:
                raise ValueError(
                    parse_result.errors[0]
                    if len(parse_result.errors) == 1
                    else "; ".join(parse_result.errors[:3])
                )
            if not parse_result.records:
                return {
                    "format": "gowitness",
                    "hosts_created": 0,
                    "ports_created": 0,
                    "screenshots_imported": 0,
                    "metadata_records_imported": 0,
                    "errors": parse_result.errors,
                    "skipped": 0,
                }
            summary = _run_gowitness(db, project_id, root, user_id, request_ip)
        return {
            "format": "gowitness",
            "hosts_created": summary.hosts_created,
            "ports_created": summary.ports_created,
            "screenshots_imported": summary.screenshots_imported,
            "metadata_records_imported": summary.metadata_records_imported,
            "errors": summary.errors,
            "skipped": summary.skipped,
        }

    if fmt == IMPORT_FORMAT_TEXT:
        summary = _run_text(db, project_id, content, filename, user_id, request_ip)
        return {
            "format": "text",
            "hosts_created": summary.hosts_created,
            "hosts_updated": summary.hosts_updated,
            "ports_created": 0,
            "ports_updated": 0,
            "evidence_created": 0,
            "errors": summary.errors,
        }

    raise ValueError(err or "Unsupported file format.")
