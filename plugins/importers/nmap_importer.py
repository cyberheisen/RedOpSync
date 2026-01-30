from __future__ import annotations
from typing import Any, Dict, List
from .base import ImporterMeta

meta = ImporterMeta(
    tool_name="nmap",
    tool_version="0.0.0-stub",
    input_hints=["Provide tool output files; importer will normalize into RedOpSync schema."],
)

def import_tool_output(project_id: str, uploaded_files: List[str], context: Dict[str, Any]) -> Dict[str, Any]:
    # TODO: implement real parsing + normalization.
    return {
        "hosts": [],
        "applications": [],
        "vulnerability_definitions": [],
        "vulnerability_instances": [],
        "notes": [],
        "evidence": [],
        "raw_artifacts": [{"path": p} for p in uploaded_files],
        "importer": {"tool": meta.tool_name, "version": meta.tool_version},
    }
