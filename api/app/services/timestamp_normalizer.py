"""
Normalize timestamps to ISO 8601 format before storing in the DB.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone


def normalize_timestamp_to_iso8601(value: str | int | float | None) -> str | None:
    """
    Normalize a timestamp to ISO 8601 format (e.g. 2026-01-12T20:10:34.563589+00:00).
    Returns None for None, empty string, or invalid input.

    Accepts:
    - ISO 8601-like strings (with Z or +00:00, with or without fractional seconds)
    - Unix epoch (int or float, seconds; values > 1e12 treated as milliseconds)
    """
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
    try:
        if isinstance(value, (int, float)):
            # Unix timestamp: if very large, assume milliseconds
            ts = float(value)
            if ts > 1e12:
                ts = ts / 1000.0
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            return dt.isoformat()
        # String: try ISO parse then fallback to Unix
        s = value.replace("Z", "+00:00").replace("z", "+00:00")
        # Python fromisoformat() only accepts up to 6 fractional digits; truncate if needed
        s = re.sub(r"(\.\d{6})\d+", r"\1", s)
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except (ValueError, TypeError, OSError):
        try:
            # Try parsing as Unix timestamp string
            ts = float(value)  # type: ignore[arg-type]
            if ts > 1e12:
                ts = ts / 1000.0
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            return dt.isoformat()
        except (ValueError, TypeError, OSError):
            return None
