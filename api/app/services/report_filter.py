"""
Filter parsing and matching for report builder. Mirrors web tree-filter logic.
Format: attr op value (e.g. ip contains "10.", severity >= High)
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

FilterOp = str  # "==" | "!=" | "contains" | "exists" | ">=" | "<=" | ">" | "<"
SEVERITY_LEVELS = ("Critical", "High", "Medium", "Low", "Info")
SEVERITY_RANK = {"Critical": 5, "High": 4, "Medium": 3, "Low": 2, "Info": 1}


@dataclass
class ParsedFilter:
    attr: str
    op: FilterOp
    value: str | int | bool | None = None


def _norm(s: str | None) -> str:
    return (s or "").strip().lower()


def _norm_val(v: Any) -> Any:
    if isinstance(v, str):
        return v.strip().lower()
    return v


def parse_filter(input_str: str) -> ParsedFilter | None:
    """Parse filter expression. Returns None if invalid."""
    raw = (input_str or "").strip()
    if not raw:
        return None
    raw = raw.strip()

    exists_match = re.match(r"^(\w+(?:\.\w+)?)\s+exists$", raw, re.I)
    if exists_match:
        return ParsedFilter(attr=exists_match.group(1).lower(), op="exists")

    quoted_match = re.match(r'^(\w+(?:\.\w+)?)\s*(==|!=|>=|<=|>|<|contains)\s*"([^"]*)"$', raw, re.I)
    if quoted_match:
        attr, op, val = quoted_match.group(1).lower(), quoted_match.group(2), quoted_match.group(3)
        num = int(val) if val.isdigit() else val
        return ParsedFilter(attr=attr, op=op, value=num)

    unquoted_match = re.match(r"^(\w+(?:\.\w+)?)\s*(==|!=|>=|<=|>|<|contains)\s+(\S+)$", raw, re.I)
    if unquoted_match:
        attr, op, val = unquoted_match.group(1).lower(), unquoted_match.group(2), unquoted_match.group(3)
        if val.lower() == "true":
            value: Any = True
        elif val.lower() == "false":
            value = False
        elif val.isdigit():
            value = int(val)
        else:
            value = val
        return ParsedFilter(attr=attr, op=op, value=value)

    return None


def _host_matches(pf: ParsedFilter, h: Any, subnet_cidr: str | None = None) -> bool:
    unresolved = _norm(getattr(h, "ip", None)) == "unresolved"
    status_norm = _norm(getattr(h, "status", None))
    online = status_norm in ("online", "up")

    attr, op, val = pf.attr, pf.op, pf.value
    v_norm = _norm_val(val) if val is not None else None

    if attr in ("hostname", "dns_name"):
        s = _norm(getattr(h, "dns_name", None))
        if op == "==":
            return s == v_norm
        if op == "!=":
            return s != v_norm
        if op == "contains":
            return (v_norm or "") in s
        return False
    if attr == "ip":
        s = _norm(getattr(h, "ip", None))
        if op == "==":
            return s == v_norm
        if op == "!=":
            return s != v_norm
        if op == "contains":
            return (v_norm or "") in s
        return False
    if attr in ("unresolved", "resolved"):
        target = attr == "unresolved"
        if op == "==":
            return (val is True and unresolved == target) or (val is False and unresolved != target)
        if op == "exists":
            return unresolved == target
        return False
    if attr in ("online", "offline"):
        target = attr == "online"
        if op == "==":
            return (val is True and online == target) or (val is False and online != target)
        if op == "exists":
            return online == target
        return False
    if attr == "status":
        s = status_norm
        if op == "==":
            return s == v_norm
        if op == "!=":
            return s != v_norm
        if op == "contains":
            return (v_norm or "") in s
        return False
    if attr == "subnet" and subnet_cidr is not None:
        s = _norm(subnet_cidr)
        if op == "==":
            return s == v_norm
        if op == "!=":
            return s != v_norm
        if op == "contains":
            return (v_norm or "") in s
        return False
    return False


def _port_matches(pf: ParsedFilter, p: Any) -> bool:
    attr, op, val = pf.attr, pf.op, pf.value
    v_norm = _norm_val(val) if val is not None else None

    if attr in ("port", "port_number"):
        num = getattr(p, "number", 0) or 0
        num_val = int(val) if isinstance(val, (int, str)) and str(val).isdigit() else 0
        if op == "==":
            return num == num_val
        if op == "!=":
            return num != num_val
        if op == ">=":
            return num >= num_val
        if op == "<=":
            return num <= num_val
        if op == ">":
            return num > num_val
        if op == "<":
            return num < num_val
        return False
    if attr == "protocol":
        s = _norm(getattr(p, "protocol", None))
        if op == "==":
            return s == v_norm
        if op == "!=":
            return s != v_norm
        if op == "contains":
            return (v_norm or "") in s
        return False
    if attr == "service":
        s = _norm(getattr(p, "service_name", None))
        if op == "==":
            return s == v_norm
        if op == "!=":
            return s != v_norm
        if op == "contains":
            return (v_norm or "") in s
        return False
    if attr == "state":
        s = _norm(getattr(p, "state", None))
        if op == "==":
            return s == v_norm
        if op == "!=":
            return s != v_norm
        if op == "contains":
            return (v_norm or "") in s
        return False
    return False


def _evidence_matches(pf: ParsedFilter, ev: Any) -> bool:
    attr, op, val = pf.attr, pf.op, pf.value
    v_norm = _norm_val(val) if val is not None else None
    cap = getattr(ev, "caption", None) or getattr(ev, "filename", None) or ""
    source = _norm(getattr(ev, "source", None))
    mime = getattr(ev, "mime", None) or ""
    is_screenshot = mime.lower().startswith("image/") if mime else False

    if attr == "page_title":
        t = _norm(cap)
        if op == "==":
            return t == v_norm
        if op == "!=":
            return t != v_norm
        if op == "contains":
            return (v_norm or "") in t
        return False
    if attr == "response_code":
        m = re.search(r"response\s*code\s*:\s*(\d+)", cap, re.I) or re.search(r"response_code\s*[=:]\s*(\d+)", cap, re.I)
        code = int(m.group(1)) if m else None
        num_val = int(val) if val is not None else 0
        if op == "==":
            return code is not None and code == num_val
        if op == "!=":
            return code is not None and code != num_val
        return False
    if attr == "server":
        m = re.search(r"server\s*:\s*([^\n]+)", cap, re.I) or re.search(r"server\s*[=:]\s*([^\n]+)", cap, re.I)
        s = _norm(m.group(1)) if m else _norm(cap)
        if op == "==":
            return s == v_norm
        if op == "!=":
            return s != v_norm
        if op == "contains":
            return (v_norm or "") in s
        return False
    if attr == "technology":
        t = _norm(cap)
        if op == "==":
            return t == v_norm
        if op == "!=":
            return t != v_norm
        if op == "contains":
            return (v_norm or "") in t
        return False
    if attr == "source":
        if op == "==":
            return source == v_norm
        if op == "!=":
            return source != v_norm
        if op == "contains":
            return (v_norm or "") in source
        return False
    if attr == "screenshot":
        if op == "exists":
            return is_screenshot
        if op == "==" and val is True:
            return is_screenshot
        if op == "==" and val is False:
            return not is_screenshot
        return False
    return False


def _vuln_matches(pf: ParsedFilter, vd: Any, vi: Any) -> bool:
    attr, op, val = pf.attr, pf.op, pf.value
    sev = vd.severity or "Info"
    if vd.cvss_score is not None and (not vd.severity or vd.severity not in SEVERITY_LEVELS):
        if vd.cvss_score >= 9:
            sev = "Critical"
        elif vd.cvss_score >= 7:
            sev = "High"
        elif vd.cvss_score >= 4:
            sev = "Medium"
        elif vd.cvss_score > 0:
            sev = "Low"
        else:
            sev = "Info"
    rank = SEVERITY_RANK.get(sev, 0)
    v_norm = _norm_val(val) if val is not None else None

    if attr in ("vuln.severity", "severity"):
        if isinstance(val, str) and val in SEVERITY_LEVELS:
            target_rank = SEVERITY_RANK.get(val, 0)
            if op == "==":
                return rank == target_rank
            if op == "!=":
                return rank != target_rank
            if op == ">=":
                return rank >= target_rank
            if op == "<=":
                return rank <= target_rank
            if op == ">":
                return rank > target_rank
            if op == "<":
                return rank < target_rank
        if op == "==":
            return _norm(sev) == v_norm
        if op == "!=":
            return _norm(sev) != v_norm
        return False
    if attr in ("vuln.title", "title"):
        t = _norm(getattr(vd, "title", None))
        if op == "==":
            return t == v_norm
        if op == "!=":
            return t != v_norm
        if op == "contains":
            return (v_norm or "") in t
        return False
    if attr in ("vuln.cvss", "cvss"):
        cvss = getattr(vd, "cvss_score", None) or getattr(vd, "cvss_score", None)
        num_val = float(val) if val is not None else 0
        if op == "==":
            return cvss is not None and cvss == num_val
        if op == "!=":
            return cvss is not None and cvss != num_val
        if op == ">=":
            return cvss is not None and cvss >= num_val
        if op == "<=":
            return cvss is not None and cvss <= num_val
        if op == ">":
            return cvss is not None and cvss > num_val
        if op == "<":
            return cvss is not None and cvss < num_val
        return False
    return False


_HOST_ATTRS = {"ip", "hostname", "dns_name", "unresolved", "resolved", "online", "offline", "status", "subnet"}
_PORT_ATTRS = {"port", "port_number", "protocol", "service", "state"}
_EVIDENCE_ATTRS = {"page_title", "response_code", "server", "technology", "source", "screenshot"}
_VULN_ATTRS = {"severity", "vuln.severity", "vuln.title", "title", "vuln.cvss", "cvss"}


def entity_matches_filter(pf: ParsedFilter, entity_type: str, entity: Any, host: Any = None, port: Any = None, vd: Any = None, vi: Any = None, subnet_cidr: str | None = None) -> bool:
    """Check if entity matches the parsed filter. Dispatches by attr."""
    attr = pf.attr
    if attr in _HOST_ATTRS and host:
        return _host_matches(pf, host, subnet_cidr)
    if attr in _PORT_ATTRS and port:
        return _port_matches(pf, port)
    if attr in _EVIDENCE_ATTRS and entity_type == "evidence":
        return _evidence_matches(pf, entity)
    if attr in _VULN_ATTRS and vd is not None and vi is not None:
        return _vuln_matches(pf, vd, vi)
    if entity_type == "host":
        return _host_matches(pf, entity, subnet_cidr)
    if entity_type == "port" and host:
        return _host_matches(pf, host, subnet_cidr) or _port_matches(pf, entity)
    if entity_type == "evidence" and host:
        return _host_matches(pf, host, subnet_cidr) or _evidence_matches(pf, entity)
    if entity_type == "vuln" and host and vd and vi:
        return _host_matches(pf, host, subnet_cidr) or _vuln_matches(pf, vd, vi)
    return False
