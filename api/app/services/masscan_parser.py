"""
Masscan list output parser.

Supports list format (-oL or default): one line per open port.
Columns: status protocol port ip timestamp
Example: open tcp 443 192.168.1.1 1699123456
Last column is Unix epoch timestamp.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

MASSCAN_SOURCE = "masscan"

# Line: open tcp 80 1.2.3.4 1699123456  (status protocol port ip timestamp)
# Optional 6th column exists in some versions (timestamp repeated or reason)
_LIST_LINE_RE = re.compile(
    r"^\s*(open|closed|open\|filtered|closed\|filtered)\s+(tcp|udp)\s+(\d+)\s+"
    r"([0-9a-fA-F.:]+)\s+(\d+)(?:\s|$)"
)


@dataclass
class MasscanPort:
    """Single port from masscan list output."""

    port_id: int
    protocol: str  # tcp | udp
    state: str
    timestamp: int | None  # Unix epoch from last column


@dataclass
class MasscanHost:
    """Host with ports from masscan (grouped by IP)."""

    ip: str
    ports: list[MasscanPort] = field(default_factory=list)


@dataclass
class MasscanParseResult:
    """Result of parsing masscan list output."""

    hosts: list[MasscanHost] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    format: str = "list"
    source_file: str = ""


def _parse_list_line(line: str) -> tuple[str, str, int, str, int] | None:
    """Parse one list-format line. Returns (status, protocol, port, ip, timestamp) or None."""
    m = _LIST_LINE_RE.match(line)
    if not m:
        return None
    status, protocol, port_s, ip, ts_s = m.groups()
    try:
        port = int(port_s)
        ts = int(ts_s)
    except ValueError:
        return None
    if port < 1 or port > 65535:
        return None
    return (status, protocol.lower(), port, ip, ts)


def parse_masscan_list(content: bytes | str, source_file: str = "") -> MasscanParseResult:
    """
    Parse masscan list output. Expects columns: status protocol port ip timestamp.

    Returns MasscanParseResult with hosts grouped by IP. Invalid lines are skipped.
    """
    result = MasscanParseResult(format="list", source_file=source_file or "masscan-import")
    if isinstance(content, bytes):
        try:
            text = content.decode("utf-8", errors="replace")
        except Exception as e:
            result.errors.append(f"Could not decode file: {e}")
            return result

    text = content if isinstance(content, str) else content.decode("utf-8", errors="replace")

    # Group by IP: ip -> list of (port_id, protocol, state, timestamp)
    by_ip: dict[str, list[MasscanPort]] = {}

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parsed = _parse_list_line(line)
        if not parsed:
            continue
        status, protocol, port_id, ip, timestamp = parsed
        if protocol not in ("tcp", "udp"):
            protocol = "tcp"
        port = MasscanPort(port_id=port_id, protocol=protocol, state=status, timestamp=timestamp)
        by_ip.setdefault(ip, []).append(port)

    for ip, ports in sorted(by_ip.items()):
        result.hosts.append(MasscanHost(ip=ip, ports=ports))

    return result


def is_masscan_list_content(content: bytes) -> bool:
    """
    Heuristic: content looks like masscan list output if we have at least one
    line matching 'open tcp NNN a.b.c.d TTTTT' (or udp).
    """
    try:
        text = content.decode("utf-8", errors="replace")
    except Exception:
        return False
    count = 0
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if _parse_list_line(line) is not None:
            count += 1
            if count >= 1:
                return True
    return False
