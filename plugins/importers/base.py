from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, List, Protocol

@dataclass(frozen=True)
class ImporterMeta:
    tool_name: str
    tool_version: str
    input_hints: List[str]

class Importer(Protocol):
    meta: ImporterMeta
    def import_tool_output(self, project_id: str, uploaded_files: List[str], context: Dict[str, Any]) -> Dict[str, Any]:
        ...

ensure_schema_note = """Importers must return a dict with keys like:
- hosts: [{ip, dns_name, ports:[...], applications:[...]}]
- vulnerability_definitions: [...]
- vulnerability_instances: [...]
- notes: [...]
- evidence: [...]
- raw_artifacts: [...]
The worker will validate and persist the normalized data.
"""
