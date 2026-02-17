"""
Nmap output parser. Supports XML (-oX) as primary format.

Format detection:
- XML: root element <nmaprun>, or .xml extension with valid nmap XML
- Grepable (-oG), normal (-oN): not yet supported, will reject with clear error
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO

NMAP_SOURCE = "nmap"
UNRESOLVED_IP = "unresolved"


@dataclass
class NmapScript:
    """NSE script output."""

    id: str
    output: str


@dataclass
class NmapPort:
    """Parsed port/service from Nmap XML."""

    port_id: int
    protocol: str  # tcp | udp
    state: str  # open | filtered | closed | open|filtered | closed|filtered
    service_name: str | None
    product: str | None
    version: str | None
    extrainfo: str | None
    ostype: str | None
    tunnel: str | None  # e.g. ssl
    scripts: list[NmapScript] = field(default_factory=list)


@dataclass
class NmapHost:
    """Parsed host from Nmap XML."""

    ip: str | None  # None if hostname-only unresolved
    hostname: str | None
    hostnames: list[str]  # all hostname entries
    status: str  # up | down | unknown
    ports: list[NmapPort] = field(default_factory=list)
    is_unresolved: bool = False  # hostname exists but IP not resolved


@dataclass
class NmapImportMetadata:
    """Metadata from Nmap scan for audit/import tracking."""

    nmap_version: str
    args: str
    scan_start: str
    scan_end: str
    source: str = "nmap"
    task_times: list[int] = field(default_factory=list)  # raw Unix epochs from taskbegin/taskend time=


@dataclass
class NmapParseResult:
    """Result of parsing Nmap output."""

    hosts: list[NmapHost] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    format: str = "unknown"  # xml | grepable | normal
    source_file: str = ""
    import_metadata: NmapImportMetadata | None = None


def _text(e: ET.Element | None) -> str:
    return (e.text or "").strip() if e is not None else ""


def _attr(e: ET.Element | None, key: str, default: str = "") -> str:
    if e is None:
        return default
    return e.get(key, default)


def _parse_port(port_el: ET.Element) -> NmapPort | None:
    try:
        port_id = int(_attr(port_el, "portid", "0"))
        protocol = (_attr(port_el, "protocol", "tcp") or "tcp").lower()
        if protocol not in ("tcp", "udp"):
            protocol = "tcp"
    except ValueError:
        return None

    state_el = port_el.find("state")
    state = _attr(state_el, "state", "unknown") if state_el is not None else "unknown"

    service_name: str | None = None
    product: str | None = None
    version: str | None = None
    extrainfo: str | None = None
    ostype: str | None = None

    tunnel: str | None = None
    service_el = port_el.find("service")
    if service_el is not None:
        service_name = _attr(service_el, "name") or None
        product = _attr(service_el, "product") or None
        version = _attr(service_el, "version") or None
        extrainfo = _attr(service_el, "extrainfo") or None
        ostype = _attr(service_el, "ostype") or None
        tn = _attr(service_el, "tunnel", "").strip().lower()
        if tn:
            tunnel = tn

    scripts: list[NmapScript] = []
    for script_el in port_el.findall("script"):
        sid = _attr(script_el, "id", "")
        out = _text(script_el)
        if sid:
            scripts.append(NmapScript(id=sid, output=out))

    return NmapPort(
        port_id=port_id,
        protocol=protocol,
        state=state,
        service_name=service_name,
        product=product,
        version=version,
        extrainfo=extrainfo,
        ostype=ostype,
        tunnel=tunnel,
        scripts=scripts,
    )


def _parse_host(host_el: ET.Element) -> NmapHost | None:
    ip: str | None = None
    hostnames: list[str] = []

    ipv4_val: str | None = None
    ipv6_val: str | None = None
    for addr in host_el.findall("address"):
        addrtype = _attr(addr, "addrtype", "")
        addr_val = _attr(addr, "addr", "")
        if addr_val:
            if addrtype == "ipv4":
                ipv4_val = addr_val
            elif addrtype == "ipv6":
                ipv6_val = addr_val
    ip = ipv4_val or ipv6_val

    hostnames_el = host_el.find("hostnames")
    if hostnames_el is not None:
        for hn in hostnames_el.findall("hostname"):
            name = _attr(hn, "name", "")
            if name:
                hostnames.append(name)

    status_el = host_el.find("status")
    status = _attr(status_el, "state", "unknown") if status_el is not None else "unknown"

    hostname_primary: str | None = hostnames[0] if hostnames else None
    is_unresolved = False

    if not ip and hostname_primary:
        is_unresolved = True
        ip = UNRESOLVED_IP

    if not ip:
        return None

    ports: list[NmapPort] = []
    ports_el = host_el.find("ports")
    if ports_el is not None:
        for port_el in ports_el.findall("port"):
            p = _parse_port(port_el)
            if p:
                ports.append(p)

    return NmapHost(
        ip=ip,
        hostname=hostname_primary,
        hostnames=hostnames,
        status=status,
        ports=ports,
        is_unresolved=is_unresolved,
    )


def _collect_task_times(root: ET.Element) -> list[int]:
    """Collect time= attributes (Unix epoch) from taskbegin and taskend elements."""
    times: list[int] = []
    for el in root.iter():
        tag = el.tag if hasattr(el, "tag") else ""
        local = tag.split("}")[-1] if "}" in tag else tag
        if local not in ("taskbegin", "taskend"):
            continue
        t = _attr(el, "time", "")
        if t:
            try:
                times.append(int(t))
            except ValueError:
                pass
    return sorted(times) if times else []


def _parse_import_metadata(root: ET.Element) -> NmapImportMetadata:
    """Extract nmap run metadata from root."""
    version = _attr(root, "version", "")
    args = _attr(root, "args", "")
    startstr = _attr(root, "startstr", "")
    endstr = ""
    runstats = root.find("runstats")
    if runstats is not None:
        finished = runstats.find("finished")
        if finished is not None:
            endstr = _attr(finished, "time", "") or _attr(finished, "timestr", "")
    task_times = _collect_task_times(root)
    return NmapImportMetadata(
        nmap_version=version,
        args=args,
        scan_start=startstr,
        scan_end=endstr,
        task_times=task_times,
    )


def _parse_xml_root(root: ET.Element, source_file: str) -> NmapParseResult:
    result = NmapParseResult(format="xml", source_file=source_file)
    if root.tag != "nmaprun":
        result.errors.append("XML root is not nmaprun; not a valid Nmap XML file")
        return result

    result.import_metadata = _parse_import_metadata(root)

    for host_el in root.findall("host"):
        try:
            h = _parse_host(host_el)
            if h:
                result.hosts.append(h)
        except Exception as e:
            result.errors.append(f"Error parsing host block: {e}")

    if not result.hosts and not result.errors:
        result.errors.append("No host blocks found in Nmap XML")

    return result


def _is_nmap_xml(content: bytes) -> bool:
    """Check if content looks like Nmap XML (has nmaprun root)."""
    start = content[:2000].decode("utf-8", errors="replace").strip()
    return "<nmaprun" in start or '<?xml' in start and "nmap" in start.lower()


def _is_nmap_grepable(content: bytes) -> bool:
    """Check if content looks like Nmap grepable output."""
    try:
        text = content[:5000].decode("utf-8", errors="replace")
        return "Host:" in text and ("Ports:" in text or "Status:" in text) and "\t" in text
    except Exception:
        return False


def _is_nmap_normal(content: bytes) -> bool:
    """Check if content looks like Nmap normal output (-oN)."""
    try:
        text = content[:2000].decode("utf-8", errors="replace")
        return "Nmap scan report" in text and "Starting Nmap" in text
    except Exception:
        return False


def detect_nmap_format(content: bytes, filename: str = "") -> str | None:
    """
    Detect Nmap output format. Returns: 'xml' | 'grepable' | 'normal' | None.
    None means unsupported or unrecognized.
    """
    fn = (filename or "").lower()
    if fn.endswith(".xml") or fn.endswith(".xml.gz"):
        if _is_nmap_xml(content):
            return "xml"
        return None
    if fn.endswith(".gnmap"):
        if _is_nmap_grepable(content):
            return "grepable"
        return None
    if fn.endswith(".nmap"):
        if _is_nmap_normal(content):
            return "normal"
        return None

    if _is_nmap_xml(content):
        return "xml"
    if _is_nmap_grepable(content):
        return "grepable"
    if _is_nmap_normal(content):
        return "normal"
    return None


def parse_nmap_xml(content: bytes | str, source_file: str = "") -> NmapParseResult:
    """
    Parse Nmap XML output. Raises ValueError if not valid XML or not Nmap format.
    """
    if isinstance(content, str):
        content = content.encode("utf-8")
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        result = NmapParseResult(format="xml", source_file=source_file)
        result.errors.append(f"Malformed XML: {e}")
        return result

    return _parse_xml_root(root, source_file)


def parse_nmap_file(path: Path) -> NmapParseResult:
    """
    Parse Nmap output file. Auto-detects format.
    - XML: supported
    - Grepable, normal: returns result with errors (not yet supported)
    """
    source_file = path.name or str(path)
    try:
        content = path.read_bytes()
    except Exception as e:
        result = NmapParseResult(source_file=source_file)
        result.errors.append(f"Could not read file: {e}")
        return result

    fmt = detect_nmap_format(content, source_file)
    if fmt == "xml":
        return parse_nmap_xml(content, source_file)
    if fmt == "grepable":
        result = NmapParseResult(format="grepable", source_file=source_file)
        result.errors.append("Grepable format (-oG) is not yet supported. Use XML output (-oX).")
        return result
    if fmt == "normal":
        result = NmapParseResult(format="normal", source_file=source_file)
        result.errors.append("Normal format (-oN) is not yet supported. Use XML output (-oX).")
        return result

    result = NmapParseResult(source_file=source_file)
    result.errors.append("Unsupported or unrecognized file format. Nmap XML (-oX) is required.")
    return result
