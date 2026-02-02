"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiUrl } from "../../lib/api";
import { useLockState } from "../../hooks/use-lock-state";
import { AddHostModal } from "../../components/add-host-modal";
import { AddSubnetModal } from "../../components/add-subnet-modal";
import { ContextMenu } from "../../components/context-menu";
import { ImportHostsModal, type ImportHostsContext } from "../../components/import-hosts-modal";
import { NoteEditorPanel, type NoteAttachment } from "../../components/note-editor-panel";
import { NotePrintView } from "../../components/note-print-view";
import { PortModal } from "../../components/port-modal";
import { PortAttachmentsSection } from "../../components/port-attachments-section";
import { VulnerabilityModal } from "../../components/vulnerability-modal";
import { AffectedHostBadge } from "../../components/affected-host-badge";
import { ManageAffectedHostsModal } from "../../components/manage-affected-hosts-modal";
import { VulnAttachmentsSection } from "../../components/vuln-attachments-section";
import { RenameHostModal } from "../../components/rename-host-modal";
import { RenameSubnetModal } from "../../components/rename-subnet-modal";
import { StubModal } from "../../components/stub-modal";
import { Toast } from "../../components/toast";
import { renderMarkdown } from "../../lib/markdown";
import {
  compareBySeverity,
  getEffectiveSeverity,
  getHighestSeverity,
  getSeverityColor,
  hasManualSeverityOverride,
  type VulnLike,
} from "../../lib/severity";

type Subnet = {
  id: string;
  project_id: string;
  cidr: string;
  name: string | null;
};

type Host = {
  id: string;
  project_id: string;
  subnet_id: string | null;
  ip: string;
  dns_name: string | null;
  status: string | null;
};

type Port = {
  id: string;
  host_id: string;
  protocol: string;
  number: number;
  state: string | null;
  service_name: string | null;
  service_version?: string | null;
  description_md?: string | null;
  evidence_md?: string | null;
  discovered_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

type VulnInstance = {
  id: string;
  host_id: string;
  vulnerability_definition_id: string;
  definition_title: string | null;
  definition_severity?: string | null;
  definition_cvss_score?: number | null;
  definition_description_md?: string | null;
  definition_evidence_md?: string | null;
  definition_cve_ids?: string[] | null;
  definition_discovered_by?: string | null;
  definition_created_at?: string | null;
  definition_updated_at?: string | null;
  port_id: string | null;
  status: string;
  notes_md?: string | null;
  created_at?: string;
  updated_at?: string;
};

type VulnDefinition = {
  id: string;
  project_id: string;
  title: string;
  severity: string | null;
  cvss_score: number | null;
  cve_ids: string[] | null;
  description_md: string | null;
  evidence_md: string | null;
  discovered_by: string | null;
  created_at: string;
  updated_at: string;
  instance_count: number;
  affected_host_ids: string[];
  affected_subnet_ids?: string[];
};

type NoteAttachmentDisplay = { id: string; filename: string; type: string; url: string };

type NoteTarget = "scope" | "subnet" | "host";

type Note = {
  id: string;
  host_id: string | null;
  subnet_id?: string | null;
  body_md: string | null;
  title?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_by?: string | null;
  updated_at?: string;
  attachments?: NoteAttachmentDisplay[];
  locked_by?: string | null;
};

type Mission = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  countdown_red_days_default: number;
};

type SelectedNode =
  | { type: "subnet"; id: string }
  | { type: "host"; id: string }
  | { type: "host-ports"; hostId: string }
  | { type: "port"; id: string }
  | { type: "host-vulnerabilities"; hostId: string }
  | { type: "vuln-instance"; id: string }
  | { type: "vuln-definition"; id: string }
  | { type: "host-notes"; hostId: string }
  | { type: "scope-notes" }
  | { type: "subnet-notes"; subnetId: string }
  | { type: "note"; id: string; target: NoteTarget; targetId: string }
  | { type: "vulnerabilities" }
  | { type: "evidence" }
  | { type: "jobs" }
  | null;

const ICON = { ports: "▸", vulns: "⚠", notes: "≡" } as const;

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return "—";
  }
}

function daysRemaining(endDate: string | null): string {
  if (!endDate) return "—";
  try {
    const end = new Date(endDate);
    const now = new Date();
    const days = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return days > 0 ? `${days}d` : "0d";
  } catch {
    return "—";
  }
}

function Spinner() {
  return (
    <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
  );
}

function SeverityBadge({ severity, compact }: { severity: string | null | undefined; compact?: boolean }) {
  const color = getSeverityColor(severity);
  if (!severity) return null;
  return (
    <span
      style={{
        fontSize: compact ? 11 : 13,
        padding: compact ? "1px 6px" : "2px 8px",
        borderRadius: 4,
        backgroundColor: "var(--bg-panel)",
        border: "1px solid " + color,
        color,
      }}
    >
      {severity}
    </span>
  );
}

function ReachabilityDot({ status }: { status: string | null }) {
  const reachable = status === "up";
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: reachable ? "#48bb78" : "var(--text-dim)",
        flexShrink: 0,
      }}
      title={reachable ? "Reachable" : "Unreachable"}
    />
  );
}

export default function MissionDetailPage() {
  const params = useParams();
  const missionId = params.id as string;
  const [mission, setMission] = useState<Mission | null>(null);
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [portsByHost, setPortsByHost] = useState<Record<string, Port[]>>({});
  const [vulnsByHost, setVulnsByHost] = useState<Record<string, VulnInstance[]>>({});
  const [notesByHost, setNotesByHost] = useState<Record<string, Note[]>>({});
  const [scopeNotes, setScopeNotes] = useState<Note[]>([]);
  const [notesBySubnet, setNotesBySubnet] = useState<Record<string, Note[]>>({});
  const [portsLoaded, setPortsLoaded] = useState<Set<string>>(new Set());
  const [vulnsLoaded, setVulnsLoaded] = useState<Set<string>>(new Set());
  const [notesLoaded, setNotesLoaded] = useState<Set<string>>(new Set());
  const [scopeNotesLoaded, setScopeNotesLoaded] = useState(false);
  const [portsLoading, setPortsLoading] = useState<Set<string>>(new Set());
  const [vulnsLoading, setVulnsLoading] = useState<Set<string>>(new Set());
  const [notesLoading, setNotesLoading] = useState<Set<string>>(new Set());
  const [scopeNotesLoading, setScopeNotesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["scope"]));
  const [saving, setSaving] = useState(false);
  const [lockError, setLockError] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: { label: string; onClick: () => void }[] } | null>(null);
  const [importHostsModal, setImportHostsModal] = useState<ImportHostsContext | null>(null);
  const [addSubnetModal, setAddSubnetModal] = useState(false);
  const [addHostModal, setAddHostModal] = useState<{ subnetId: string | null } | null>(null);
  const [renameSubnetModal, setRenameSubnetModal] = useState<Subnet | null>(null);
  const [renameHostModal, setRenameHostModal] = useState<Host | null>(null);
  const [noteModal, setNoteModal] = useState<{
    mode: "add" | "edit";
    target: NoteTarget;
    host?: Host;
    subnet?: Subnet;
    note?: Note;
  } | null>(null);
  const [notePrintView, setNotePrintView] = useState<{ note: Note; target: NoteTarget; host?: Host; subnet?: Subnet } | null>(null);
  const [deleteNoteModal, setDeleteNoteModal] = useState<{ note: Note; target: NoteTarget; host?: Host; subnet?: Subnet } | null>(null);
  const [portModal, setPortModal] = useState<{ mode: "add" | "edit"; host: Host; port?: Port } | null>(null);
  const [deletePortModal, setDeletePortModal] = useState<{ port: Port; host: Host } | null>(null);
  const [vulnDefinitions, setVulnDefinitions] = useState<VulnDefinition[]>([]);
  const [vulnDefinitionsLoaded, setVulnDefinitionsLoaded] = useState(false);
  const [vulnDefinitionsLoading, setVulnDefinitionsLoading] = useState(false);
  const [vulnModal, setVulnModal] = useState<{ mode: "add" | "edit"; host?: Host; vuln?: VulnInstance; definition?: VulnDefinition } | null>(null);
  const [manageAffectedHostsModal, setManageAffectedHostsModal] = useState<VulnDefinition | null>(null);
  const [deleteVulnModal, setDeleteVulnModal] = useState<{ instance: VulnInstance } | null>(null);
  const [stubModal, setStubModal] = useState<{ title: string; message?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { locks, acquireLock, releaseLock, renewLock, refreshLocks } = useLockState(missionId);

  const loadPortsForHost = useCallback((hostId: string) => {
    if (portsLoaded.has(hostId) || portsLoading.has(hostId)) return;
    setPortsLoading((p) => new Set(p).add(hostId));
    fetch(apiUrl(`/api/ports?host_id=${hostId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((ports: Port[]) => {
        setPortsByHost((prev) => ({ ...prev, [hostId]: ports }));
        setPortsLoaded((p) => new Set(p).add(hostId));
      })
      .finally(() => setPortsLoading((p) => { const n = new Set(p); n.delete(hostId); return n; }));
  }, [portsLoaded, portsLoading]);

  const loadVulnsForHost = useCallback((hostId: string) => {
    if (vulnsLoaded.has(hostId) || vulnsLoading.has(hostId)) return;
    setVulnsLoading((p) => new Set(p).add(hostId));
    fetch(apiUrl(`/api/vulnerability-instances?host_id=${hostId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((vulns: VulnInstance[]) => {
        setVulnsByHost((prev) => ({ ...prev, [hostId]: vulns }));
        setVulnsLoaded((p) => new Set(p).add(hostId));
      })
      .finally(() => setVulnsLoading((p) => { const n = new Set(p); n.delete(hostId); return n; }));
  }, [vulnsLoaded, vulnsLoading]);

  const loadNotesForHost = useCallback((hostId: string) => {
    if (notesLoaded.has(hostId) || notesLoading.has(hostId)) return;
    setNotesLoading((p) => new Set(p).add(hostId));
    fetch(apiUrl(`/api/notes?host_id=${hostId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: { id: string; host_id: string | null; body_md: string | null; created_at?: string; updated_at?: string }[]) => {
        const notes: Note[] = raw.map((n) => ({
          ...n,
          title: null,
          created_by: "Unknown",
          created_at: n.created_at ?? new Date().toISOString(),
          updated_by: "Unknown",
          updated_at: n.updated_at ?? n.created_at ?? new Date().toISOString(),
          attachments: [],
        }));
        setNotesByHost((prev) => ({ ...prev, [hostId]: notes }));
        setNotesLoaded((p) => new Set(p).add(hostId));
      })
      .finally(() => setNotesLoading((p) => { const n = new Set(p); n.delete(hostId); return n; }));
  }, [notesLoaded, notesLoading]);

  const loadScopeNotes = useCallback(() => {
    if (scopeNotesLoaded || scopeNotesLoading) return;
    setScopeNotesLoading(true);
    fetch(apiUrl(`/api/notes?project_id=${missionId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: { id: string; host_id: string | null; body_md: string | null; created_at?: string; updated_at?: string }[]) => {
        const notes: Note[] = raw
          .filter((n) => !n.host_id)
          .map((n) => ({
            ...n,
            title: null,
            created_by: "Unknown",
            created_at: n.created_at ?? new Date().toISOString(),
            updated_by: "Unknown",
            updated_at: n.updated_at ?? n.created_at ?? new Date().toISOString(),
            attachments: [],
          }));
        setScopeNotes(notes);
        setScopeNotesLoaded(true);
      })
      .finally(() => setScopeNotesLoading(false));
  }, [missionId, scopeNotesLoaded, scopeNotesLoading]);

  const loadVulnDefinitions = useCallback(() => {
    if (vulnDefinitionsLoaded || vulnDefinitionsLoading) return;
    setVulnDefinitionsLoading(true);
    fetch(apiUrl(`/api/vulnerability-definitions?project_id=${missionId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((defs: VulnDefinition[]) => {
        setVulnDefinitions(defs);
        setVulnDefinitionsLoaded(true);
      })
      .finally(() => setVulnDefinitionsLoading(false));
  }, [missionId, vulnDefinitionsLoaded, vulnDefinitionsLoading]);

  const refreshVulnDefinitions = useCallback(() => {
    setVulnDefinitionsLoading(true);
    fetch(apiUrl(`/api/vulnerability-definitions?project_id=${missionId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((defs: VulnDefinition[]) => {
        setVulnDefinitions(defs);
        setVulnDefinitionsLoaded(true);
      })
      .finally(() => setVulnDefinitionsLoading(false));
  }, [missionId]);

  const loadData = useCallback(() => {
    setSelectedNode(null);
    setPortsByHost({});
    setVulnsByHost({});
    setNotesByHost({});
    setScopeNotes([]);
    setNotesBySubnet({});
    setVulnDefinitions([]);
    setVulnDefinitionsLoaded(false);
    setPortsLoaded(new Set());
    setVulnsLoaded(new Set());
    setNotesLoaded(new Set());
    setScopeNotesLoaded(false);
    Promise.all([
      fetch(apiUrl(`/api/projects/${missionId}`), { credentials: "include" }),
      fetch(apiUrl(`/api/subnets?project_id=${missionId}`), { credentials: "include" }),
      fetch(apiUrl(`/api/hosts?project_id=${missionId}`), { credentials: "include" }),
    ])
      .then(async ([projRes, subnetsRes, hostsRes]) => {
        if (!projRes.ok) throw new Error("Mission not found");
        if (!subnetsRes.ok) throw new Error("Failed to load subnets");
        if (!hostsRes.ok) throw new Error("Failed to load hosts");
        const [proj, subnetList, hostList] = await Promise.all([projRes.json(), subnetsRes.json(), hostsRes.json()]);
        setMission(proj);
        setSubnets(subnetList);
        setHosts(hostList);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [missionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (mission && !vulnDefinitionsLoaded && !vulnDefinitionsLoading) {
      loadVulnDefinitions();
    }
  }, [mission, vulnDefinitionsLoaded, vulnDefinitionsLoading, loadVulnDefinitions]);

  const hostIds = hosts.map((h) => h.id).sort().join(",");
  useEffect(() => {
    if (!mission || hosts.length === 0) return;
    hosts.forEach((h) => {
      loadPortsForHost(h.id);
      loadVulnsForHost(h.id);
    });
  }, [mission?.id, hostIds, loadPortsForHost, loadVulnsForHost]);

  const selectedHost =
    selectedNode?.type === "host" || selectedNode?.type === "host-ports" || selectedNode?.type === "host-vulnerabilities" || selectedNode?.type === "host-notes" || (selectedNode?.type === "note" && selectedNode.target === "host")
      ? hosts.find((h) =>
          selectedNode!.type === "note"
            ? selectedNode.targetId === h.id
            : selectedNode!.type === "host"
              ? selectedNode.id === h.id
              : selectedNode!.hostId === h.id
        ) ?? null
      : null;

  useEffect(() => {
    if (selectedHost) refreshLocks();
  }, [selectedHost, refreshLocks]);

  const toggleExpand = (key: string, onExpand?: () => void) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const isExpanding = !next.has(key);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (isExpanding && onExpand) onExpand();
      return next;
    });
  };

  const hostsBySubnet = hosts.reduce<Record<string, Host[]>>((acc, h) => {
    const k = h.subnet_id ?? "_unassigned";
    if (!acc[k]) acc[k] = [];
    acc[k].push(h);
    return acc;
  }, {});

  const allVulns = Object.values(vulnsByHost).flat();
  const scopeSeverity = getHighestSeverity(
    vulnDefinitions.length > 0
      ? vulnDefinitions.map((d) => ({ definition_severity: d.severity, definition_cvss_score: d.cvss_score }))
      : allVulns
  );
  const subnetSeverity = (subnetId: string) => {
    const defsInSubnet = vulnDefinitions.filter((d) =>
      (d.affected_host_ids ?? []).some((hid) => (hostsBySubnet[subnetId] ?? []).some((h) => h.id === hid))
    );
    const vulnsInSubnet = (hostsBySubnet[subnetId] ?? []).flatMap((h) => vulnsByHost[h.id] ?? []);
    return getHighestSeverity(
      defsInSubnet.length > 0
        ? defsInSubnet.map((d) => ({ definition_severity: d.severity, definition_cvss_score: d.cvss_score }))
        : vulnsInSubnet
    );
  };
  const hostSeverity = (hostId: string) => getHighestSeverity(vulnsByHost[hostId] ?? []);
  const portSeverity = (hostId: string, portId: string) =>
    getHighestSeverity((vulnsByHost[hostId] ?? []).filter((v) => v.port_id === portId));

  const getLockForRecord = (recordType: string, recordId: string) =>
    locks.find((l) => l.record_type === recordType && l.record_id === recordId) ?? null;

  const currentHostLock = selectedHost ? getLockForRecord("host", selectedHost.id) : null;

  const myHostLockId =
    selectedHost && currentUserId
      ? locks.find(
          (l) =>
            l.record_type === "host" &&
            l.record_id === selectedHost.id &&
            l.locked_by_user_id === currentUserId
        )?.id ?? null
      : null;

  useEffect(() => {
    if (!myHostLockId) return;
    const interval = setInterval(() => renewLock(myHostLockId), 60_000);
    return () => clearInterval(interval);
  }, [myHostLockId, renewLock]);

  const handleAcquireLock = async (recordType: string, recordId: string) => {
    setLockError("");
    try {
      await acquireLock(recordType, recordId);
    } catch (e) {
      setLockError(String(e));
    }
  };

  const handleReleaseLock = async (lockId: string) => {
    setLockError("");
    try {
      await releaseLock(lockId);
    } catch (e) {
      setLockError(String(e));
    }
  };

  const handleSaveHost = async (hostId: string, ip: string, dnsName: string) => {
    const lock = getLockForRecord("host", hostId);
    if (!lock) {
      setLockError("Acquire lock before editing");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/hosts/${hostId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: ip.trim(), dns_name: (dnsName || "").trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to save");
      }
      setRenameHostModal(null);
      loadData();
    } catch (e) {
      setLockError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSubnet = async (cidr: string, name: string) => {
    setLockError("");
    try {
      const res = await fetch(apiUrl("/api/subnets"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: missionId,
          cidr: cidr.trim(),
          name: (name || "").trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to create subnet");
      }
      setAddSubnetModal(false);
      loadData();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleRenameSubnet = async (_subnetId: string, _cidr: string, _name: string) => {
    setRenameSubnetModal(null);
    setToast("Rename subnet (stub)");
  };

  const handleSaveNote = async (
    target: NoteTarget,
    targetId: string,
    title: string,
    bodyMd: string,
    fileAttachments: NoteAttachment[],
    existingNote?: Note
  ) => {
    const newAttachments: NoteAttachmentDisplay[] = fileAttachments.map((a, i) => ({
      id: `att-${Date.now()}-${i}`,
      filename: a.file.name,
      type: a.file.type,
      url: a.previewUrl ?? URL.createObjectURL(a.file),
    }));
    const baseNote = {
      title: title || null,
      body_md: bodyMd,
      attachments: [...(existingNote?.attachments ?? []), ...newAttachments],
      updated_by: "You" as const,
      updated_at: new Date().toISOString(),
    };
    if (existingNote) {
      if (target === "scope") {
        setScopeNotes((prev) => prev.map((n) => (n.id === existingNote.id ? { ...n, ...baseNote } : n)));
      } else if (target === "subnet") {
        setNotesBySubnet((prev) => ({
          ...prev,
          [targetId]: (prev[targetId] ?? []).map((n) => (n.id === existingNote.id ? { ...n, ...baseNote } : n)),
        }));
      } else {
        setNotesByHost((prev) => ({
          ...prev,
          [targetId]: (prev[targetId] ?? []).map((n) => (n.id === existingNote.id ? { ...n, ...baseNote } : n)),
        }));
      }
    } else {
      const newNote: Note = {
        id: `local-${Date.now()}`,
        host_id: target === "host" ? targetId : null,
        subnet_id: target === "subnet" ? targetId : null,
        body_md: bodyMd,
        title: title || null,
        created_by: "You",
        created_at: new Date().toISOString(),
        updated_by: "You",
        updated_at: new Date().toISOString(),
        attachments: newAttachments,
      };
      if (target === "scope") {
        setScopeNotes((prev) => [newNote, ...prev]);
        setScopeNotesLoaded(true);
      } else if (target === "subnet") {
        setNotesBySubnet((prev) => ({ ...prev, [targetId]: [newNote, ...(prev[targetId] ?? [])] }));
      } else {
        setNotesByHost((prev) => ({ ...prev, [targetId]: [newNote, ...(prev[targetId] ?? [])] }));
        setNotesLoaded((p) => new Set(p).add(targetId));
      }
    }
    setNoteModal(null);
    setToast("Note saved");
  };

  const handleDeleteNote = (note: Note, target: NoteTarget, targetId: string) => {
    if (target === "scope") {
      setScopeNotes((prev) => prev.filter((n) => n.id !== note.id));
    } else if (target === "subnet") {
      setNotesBySubnet((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? []).filter((n) => n.id !== note.id) }));
    } else {
      setNotesByHost((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? []).filter((n) => n.id !== note.id) }));
    }
    setDeleteNoteModal(null);
    setSelectedNode(null);
    setToast("Note deleted");
  };

  const handleCreatePort = async (
    hostId: string,
    data: { number: number; protocol: "tcp" | "udp"; state: string; service_name: string | null; description_md: string | null; evidence_md: string | null }
  ): Promise<Port | void> => {
    setLockError("");
    try {
      const res = await fetch(apiUrl("/api/ports"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host_id: hostId,
          protocol: data.protocol,
          number: data.number,
          state: data.state || "unknown",
          service_name: data.service_name,
          description_md: data.description_md,
          evidence_md: data.evidence_md,
          discovered_by: "manual",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to create port");
      }
      const created = await res.json();
      setPortsByHost((prev) => {
        const list = prev[hostId] ?? [];
        return { ...prev, [hostId]: [...list, created].sort((a: Port, b: Port) => a.number - b.number || String(a.protocol).localeCompare(String(b.protocol))) };
      });
      setPortsLoaded((p) => new Set(p).add(hostId));
      setToast("Port added");
      return created;
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleUpdatePort = async (
    hostId: string,
    portId: string,
    data: { number: number; protocol: "tcp" | "udp"; state: string; service_name: string | null; description_md: string | null; evidence_md: string | null }
  ) => {
    setLockError("");
    try {
      await acquireLock("port", portId);
      const res = await fetch(apiUrl(`/api/ports/${portId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: data.state || "unknown",
          service_name: data.service_name,
          description_md: data.description_md,
          evidence_md: data.evidence_md,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to update port");
      }
      const updated = await res.json();
      setPortModal(null);
      setPortsByHost((prev) => ({
        ...prev,
        [hostId]: (prev[hostId] ?? []).map((p) => (p.id === portId ? { ...p, ...updated } : p)),
      }));
      setToast("Port updated");
      refreshLocks();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleDeletePort = async (portId: string, hostId: string) => {
    setLockError("");
    try {
      await acquireLock("port", portId);
      const res = await fetch(apiUrl(`/api/ports/${portId}`), { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to delete port");
      }
      setDeletePortModal(null);
      setPortsByHost((prev) => ({ ...prev, [hostId]: (prev[hostId] ?? []).filter((p) => p.id !== portId) }));
      setSelectedNode(null);
      setToast("Port deleted");
      refreshLocks();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleCreateVuln = async (data: {
    hostIds: string[];
    title: string;
    severity: string;
    cvss_score: number | null;
    cve_ids: string[];
    description_md: string | null;
    evidence_md: string | null;
    subnet_ids: string[];
  }): Promise<{ id: string } | void> => {
    setLockError("");
    try {
      const hostIds = data.hostIds.length > 0 ? data.hostIds : [hosts[0]?.id].filter(Boolean) as string[];
      if (hostIds.length === 0) {
        setLockError("No hosts selected");
        return;
      }
      const res = await fetch(apiUrl("/api/vulnerability-definitions"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: missionId,
          host_id: hostIds[0],
          port_id: null,
          subnet_ids: data.subnet_ids ?? [],
          title: data.title,
          severity: data.severity,
          cvss_score: data.cvss_score,
          cve_ids: data.cve_ids,
          description_md: data.description_md,
          evidence_md: data.evidence_md,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === "string" ? d.detail : "Failed to create vulnerability");
      }
      const created = await res.json();
      if (hostIds.length > 1) {
        const patchRes = await fetch(apiUrl(`/api/vulnerability-definitions/${created.id}/affected-hosts`), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host_ids: hostIds }),
        });
        if (!patchRes.ok) {
          setLockError("Created but failed to apply to all hosts");
        }
      }
      refreshVulnDefinitions();
      hostIds.forEach((id) => loadVulnsForHost(id));
      setToast("Vulnerability added");
      return { id: created.id };
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleUpdateVuln = async (
    definitionId: string,
    data: {
      hostIds: string[];
      title: string;
      severity: string;
      cvss_score: number | null;
      cve_ids: string[];
      description_md: string | null;
      evidence_md: string | null;
      subnet_ids: string[];
    }
  ) => {
    setLockError("");
    try {
      await acquireLock("vulnerability_definition", definitionId);
      const res = await fetch(apiUrl(`/api/vulnerability-definitions/${definitionId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          severity: data.severity,
          cvss_score: data.cvss_score,
          cve_ids: data.cve_ids,
          description_md: data.description_md,
          evidence_md: data.evidence_md,
          subnet_ids: data.subnet_ids ?? [],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === "string" ? d.detail : "Failed to update vulnerability");
      }
      if (data.hostIds.length > 0) {
        const patchRes = await fetch(apiUrl(`/api/vulnerability-definitions/${definitionId}/affected-hosts`), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host_ids: data.hostIds }),
        });
        if (!patchRes.ok) {
          setLockError("Updated but failed to sync affected hosts");
        }
      }
      setVulnModal(null);
      refreshVulnDefinitions();
      hosts.forEach((h) => loadVulnsForHost(h.id));
      setToast("Vulnerability updated");
      refreshLocks();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleDeleteVuln = async (definitionId: string) => {
    setLockError("");
    try {
      await acquireLock("vulnerability_definition", definitionId);
      const res = await fetch(apiUrl(`/api/vulnerability-definitions/${definitionId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to delete vulnerability");
      }
      setDeleteVulnModal(null);
      refreshVulnDefinitions();
      setVulnDefinitions((prev) => prev.filter((d) => d.id !== definitionId));
      setVulnsByHost((prev) => {
        const next: Record<string, VulnInstance[]> = {};
        for (const [hId, list] of Object.entries(prev)) {
          const filtered = list.filter((v) => v.vulnerability_definition_id !== definitionId);
          if (filtered.length > 0) next[hId] = filtered;
        }
        return next;
      });
      setSelectedNode(null);
      setToast("Vulnerability deleted");
      refreshLocks();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const handleCreateHost = async (ip: string, dnsName: string, subnetId: string | null) => {
    setLockError("");
    try {
      const res = await fetch(apiUrl("/api/hosts"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: missionId,
          subnet_id: subnetId || null,
          ip: ip.trim(),
          dns_name: (dnsName || "").trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to create host");
      }
      setAddHostModal(null);
      loadData();
    } catch (err) {
      setLockError(String(err));
    }
  };

  const expandHostAndLoad = (hostId: string) => {
    loadPortsForHost(hostId);
    loadVulnsForHost(hostId);
  };

  useEffect(() => {
    if (portModal || vulnModal) setLockError("");
  }, [portModal, vulnModal]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setCurrentUserId(u?.id ?? null))
      .catch(() => {});
  }, []);

  if (loading) return <main style={{ padding: 24, color: "var(--text)" }}>Loading…</main>;
  if (error)
    return (
      <main style={{ padding: 24, color: "var(--error)" }}>
        Error: {error}
        <div style={{ marginTop: 16 }}>
          <Link href="/missions" className="theme-link">Switch mission</Link>
        </div>
      </main>
    );
  if (!mission) return null;

  const treeStyle = {
    width: 280,
    minWidth: 280,
    borderRight: "1px solid var(--border)",
    overflowY: "auto" as const,
    padding: "8px 0",
    fontSize: 13,
    backgroundColor: "var(--tree-bg)",
    color: "var(--text)",
  };

  const nodeStyle = (depth: number) =>
    ({ padding: "4px 8px 4px " + (12 + depth * 12) + "px", display: "flex", alignItems: "center", gap: 6, minHeight: 24, color: "var(--text)" } as React.CSSProperties);

  const renderTreeHost = (h: Host, baseDepth: number) => {
    const hKey = `host:${h.id}`;
    const portsKey = `host-ports:${h.id}`;
    const vulnsKey = `host-vulns:${h.id}`;
    const notesKey = `host-notes:${h.id}`;
    const hExp = expanded.has(hKey);
    const portsExp = expanded.has(portsKey);
    const vulnsExp = expanded.has(vulnsKey);
    const ports = portsByHost[h.id] ?? [];
    const vulns = vulnsByHost[h.id] ?? [];
    const portsLoad = portsLoading.has(h.id);
    const vulnsLoad = vulnsLoading.has(h.id);
    const notesLoad = notesLoading.has(h.id);
    const portCount = portsLoaded.has(h.id) ? ports.length : null;
    const vulnCount = vulnsLoaded.has(h.id) ? vulns.length : null;
    const countStr =
      portCount !== null && vulnCount !== null
        ? ` (${portCount} ports • ${vulnCount} vulns)`
        : portCount !== null
          ? ` (${portCount} ports)`
          : vulnCount !== null
            ? ` (${vulnCount} vulns)`
            : "";

    return (
      <div key={h.id}>
        <div
          className={"theme-tree-node" + (selectedNode?.type === "host" && selectedNode.id === h.id ? " selected" : "")}
          style={{ ...nodeStyle(baseDepth), color: hostSeverity(h.id) ? getSeverityColor(hostSeverity(h.id)) : "var(--text)" }}
          onClick={(ev) => {
            ev.stopPropagation();
            toggleExpand(hKey, () => expandHostAndLoad(h.id));
            setSelectedNode({ type: "host", id: h.id });
          }}
          onContextMenu={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const hostLock = getLockForRecord("host", h.id);
            const isMyLock = hostLock?.locked_by_user_id === currentUserId;
            const lockItems =
              hostLock && isMyLock
                ? [{ label: "Release lock", onClick: () => { const l = locks.find((x) => x.record_type === "host" && x.record_id === h.id); if (l?.id) handleReleaseLock(l.id); } }]
                : !hostLock
                  ? [{ label: "Acquire lock", onClick: () => handleAcquireLock("host", h.id) }]
                  : [];
            setContextMenu({
              x: ev.clientX,
              y: ev.clientY,
              items: [
                ...lockItems,
                { label: "Add Port", onClick: () => setPortModal({ mode: "add", host: h }) },
                { label: "Add Vulnerability", onClick: () => setVulnModal({ mode: "add", host: h }) },
                { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "host", host: h }) },
                { label: "Rename", onClick: () => setRenameHostModal(h) },
                { label: "Delete", onClick: () => setStubModal({ title: "Delete", message: "Coming soon (stub)" }) },
              ],
            });
          }}
        >
          <span style={{ width: 14, display: "inline-block", textAlign: "center" }}>{hExp ? "▼" : "▶"}</span>
          <ReachabilityDot status={h.status} />
          <span style={{ fontWeight: 500 }}>{h.ip}{countStr}</span>
          {!h.subnet_id && <span style={{ color: "var(--text-dim)", fontSize: 11 }}> (unassigned)</span>}
        </div>
        {hExp && (
          <>
            <div
              className={"theme-tree-node" + (selectedNode?.type === "host-ports" && selectedNode.hostId === h.id ? " selected" : "")}
              style={nodeStyle(baseDepth + 1)}
              onClick={(ev) => {
                ev.stopPropagation();
                toggleExpand(portsKey, () => loadPortsForHost(h.id));
                setSelectedNode({ type: "host-ports", hostId: h.id });
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setContextMenu({
                  x: ev.clientX,
                  y: ev.clientY,
                  items: [{ label: "Add Port", onClick: () => setPortModal({ mode: "add", host: h }) }],
                });
              }}
            >
              <span style={{ width: 14, textAlign: "center" }}>{portsExp ? "▼" : "▶"}</span>
              <span style={{ opacity: 0.8 }}>{ICON.ports}</span>
              <span>Ports</span>
              {portsLoad && <Spinner />}
              {portsLoaded.has(h.id) && !portsLoad && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({ports.length})</span>}
            </div>
            {portsExp && (
              <>
                {portsLoad ? (
                  <div className="theme-tree-node" style={{ ...nodeStyle(baseDepth + 2), color: "var(--text-muted)" }}>Loading…</div>
                ) : (
                  ports.map((p) => {
                    const isSel = selectedNode?.type === "port" && selectedNode.id === p.id;
                    return (
                      <div
                        key={p.id}
                        className={"theme-tree-node" + (isSel ? " selected" : "")}
                        style={{ ...nodeStyle(baseDepth + 2), color: portSeverity(h.id, p.id) ? getSeverityColor(portSeverity(h.id, p.id)) : "var(--text)" }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelectedNode({ type: "port", id: p.id });
                        }}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          setContextMenu({
                            x: ev.clientX,
                            y: ev.clientY,
                            items: [
                              { label: "Edit Port", onClick: () => setPortModal({ mode: "edit", host: h, port: p }) },
                              { label: "Delete Port", onClick: () => setDeletePortModal({ port: p, host: h }) },
                            ],
                          });
                        }}
                      >
                        <span style={{ width: 14 }}>•</span>
                        {p.number}/{p.protocol}
                        {p.service_name && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> {p.service_name}</span>}
                      </div>
                    );
                  })
                )}
              </>
            )}
            <div
              className={"theme-tree-node" + (selectedNode?.type === "host-vulnerabilities" && selectedNode.hostId === h.id ? " selected" : "")}
              style={nodeStyle(baseDepth + 1)}
              onClick={(ev) => {
                ev.stopPropagation();
                toggleExpand(vulnsKey, () => loadVulnsForHost(h.id));
                setSelectedNode({ type: "host-vulnerabilities", hostId: h.id });
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setContextMenu({
                  x: ev.clientX,
                  y: ev.clientY,
                  items: [{ label: "Add Vulnerability", onClick: () => setVulnModal({ mode: "add", host: h }) }],
                });
              }}
            >
              <span style={{ width: 14, textAlign: "center" }}>{vulnsExp ? "▼" : "▶"}</span>
              <span style={{ opacity: 0.8 }}>{ICON.vulns}</span>
              <span>Vulnerabilities</span>
              {vulnsLoad && <Spinner />}
              {vulnsLoaded.has(h.id) && !vulnsLoad && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({vulns.length})</span>}
            </div>
            {vulnsExp && (
              <>
                {vulnsLoad ? (
                  <div className="theme-tree-node" style={{ ...nodeStyle(baseDepth + 2), color: "var(--text-muted)" }}>Loading…</div>
                ) : vulns.length === 0 ? (
                  <div className="theme-tree-node" style={{ ...nodeStyle(baseDepth + 2), color: "var(--text-dim)", fontStyle: "italic" }}>None</div>
                ) : (
                  [...vulns].sort(compareBySeverity).map((v) => {
                    const isSel = selectedNode?.type === "vuln-instance" && selectedNode.id === v.id;
                    const effSev = getEffectiveSeverity(v);
                    return (
                      <div
                        key={v.id}
                        className={"theme-tree-node" + (isSel ? " selected" : "")}
                        style={{ ...nodeStyle(baseDepth + 2), color: getSeverityColor(effSev) }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelectedNode({ type: "vuln-instance", id: v.id });
                        }}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          setContextMenu({
                            x: ev.clientX,
                            y: ev.clientY,
                            items: [
                              { label: "Edit", onClick: () => setVulnModal({ mode: "edit", host: h, vuln: v }) },
                              { label: "Delete", onClick: () => setDeleteVulnModal({ instance: v }) },
                            ],
                          });
                        }}
                      >
                        <span style={{ width: 14 }}>•</span>
                        {v.definition_title ?? v.id.slice(0, 8)}
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}> [{v.status}]</span>
                      </div>
                    );
                  })
                )}
              </>
            )}
            <div
              className={"theme-tree-node" + (selectedNode?.type === "host-notes" && selectedNode.hostId === h.id ? " selected" : "")}
              style={nodeStyle(baseDepth + 1)}
              onClick={(ev) => {
                ev.stopPropagation();
                toggleExpand(notesKey, () => loadNotesForHost(h.id));
                setSelectedNode({ type: "host-notes", hostId: h.id });
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (!notesLoaded.has(h.id) && !notesLoading.has(h.id)) loadNotesForHost(h.id);
                setContextMenu({
                  x: ev.clientX,
                  y: ev.clientY,
                  items: [{ label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "host", host: h }) }],
                });
              }}
            >
              <span style={{ width: 14, textAlign: "center" }}>{expanded.has(notesKey) ? "▼" : "▶"}</span>
              <span style={{ opacity: 0.8 }}>{ICON.notes}</span>
              <span>Notes</span>
              {notesLoad && <Spinner />}
              {notesLoaded.has(h.id) && !notesLoad && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({(notesByHost[h.id] ?? []).length})</span>}
            </div>
            {expanded.has(notesKey) && (
              <>
                {notesLoad ? (
                  <div className="theme-tree-node" style={{ ...nodeStyle(baseDepth + 2), color: "var(--text-muted)" }}>Loading…</div>
                ) : (notesByHost[h.id] ?? []).length === 0 ? (
                  <div className="theme-tree-node" style={{ ...nodeStyle(baseDepth + 2), color: "var(--text-dim)", fontStyle: "italic" }}>None</div>
                ) : (
                    (notesByHost[h.id] ?? []).map((n) => {
                    const isSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "host" && selectedNode.targetId === h.id;
                    const noteTitle = n.title || (n.body_md?.split("\n")[0]?.slice(0, 30) ?? "Untitled");
                    return (
                      <div
                        key={n.id}
                        className={"theme-tree-node" + (isSel ? " selected" : "")}
                        style={nodeStyle(baseDepth + 2)}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelectedNode({ type: "note", id: n.id, target: "host", targetId: h.id });
                        }}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          setContextMenu({
                            x: ev.clientX,
                            y: ev.clientY,
                            items: [
                              { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "host", host: h, note: n }) },
                              { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "host", host: h }) },
                              { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "host", host: h }) },
                            ],
                          });
                        }}
                      >
                        <span style={{ width: 14 }}>•</span>
                        {noteTitle}{noteTitle.length >= 30 ? "…" : ""}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const renderDetailPane = () => {
    if (noteModal) {
      const contextLabel =
        noteModal.target === "scope"
          ? "Scope"
          : noteModal.target === "subnet" && noteModal.subnet
            ? `Subnet: ${noteModal.subnet.cidr}${noteModal.subnet.name ? ` (${noteModal.subnet.name})` : ""}`
            : noteModal.host
              ? `Host: ${noteModal.host.ip}${noteModal.host.dns_name ? ` (${noteModal.host.dns_name})` : ""}`
              : "";
      const targetId =
        noteModal.target === "scope" ? missionId : noteModal.target === "subnet" ? noteModal.subnet!.id : noteModal.host!.id;
      return (
        <NoteEditorPanel
          contextLabel={contextLabel}
          note={noteModal.note}
          onClose={() => setNoteModal(null)}
          onSave={(title, bodyMd, attachments) => handleSaveNote(noteModal.target, targetId, title, bodyMd, attachments, noteModal.note)}
        />
      );
    }
    if (!selectedNode) {
      return (
        <div style={{ padding: 24 }}>
          <p style={{ color: "var(--text-muted)" }}>Select a node from the tree. Right-click for actions.</p>
        </div>
      );
    }
    if (selectedNode.type === "scope-notes") {
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Scope Notes</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Right-click to add a note.</p>
          {scopeNotesLoading ? (
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : scopeNotes.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No notes for this scope.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {scopeNotes.map((n) => (
                <li
                  key={n.id}
                  style={{ marginBottom: 8, padding: 12, backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => setSelectedNode({ type: "note", id: n.id, target: "scope", targetId: missionId })}
                >
                  {n.title || "Untitled"}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (selectedNode.type === "subnet-notes") {
      const subnet = subnets.find((s) => s.id === selectedNode.subnetId);
      if (!subnet) return null;
      const notes = notesBySubnet[subnet.id] ?? [];
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Notes — {subnet.cidr}{subnet.name ? ` (${subnet.name})` : ""}</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Right-click to add a note.</p>
          {notes.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No notes for this subnet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {notes.map((n) => (
                <li
                  key={n.id}
                  style={{ marginBottom: 8, padding: 12, backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => setSelectedNode({ type: "note", id: n.id, target: "subnet", targetId: subnet.id })}
                >
                  {n.title || "Untitled"}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (selectedNode.type === "vulnerabilities") {
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Vulnerabilities</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Right-click to add a vulnerability. Select one from the tree to view details.</p>
          {vulnDefinitionsLoading ? (
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : vulnDefinitions.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No vulnerabilities yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {[...vulnDefinitions].sort((a, b) => compareBySeverity({ definition_severity: a.severity, definition_cvss_score: a.cvss_score }, { definition_severity: b.severity, definition_cvss_score: b.cvss_score })).map((d) => (
                <li
                  key={d.id}
                  style={{ marginBottom: 8, padding: 12, backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => setSelectedNode({ type: "vuln-definition", id: d.id })}
                >
                  <strong>{d.title}</strong>
                  <SeverityBadge severity={getEffectiveSeverity({ definition_severity: d.severity, definition_cvss_score: d.cvss_score })} compact />
                  <span onClick={(e) => e.stopPropagation()}>
                    <AffectedHostBadge count={d.affected_host_ids.length} onClick={() => setManageAffectedHostsModal(d)} compact />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (selectedNode.type === "vuln-definition") {
      const def = vulnDefinitions.find((d) => d.id === selectedNode.id);
      if (!def) return <div style={{ padding: 24, color: "var(--text-muted)" }}>Vulnerability not found.</div>;
      const defVulnLike: VulnLike = { definition_severity: def.severity, definition_cvss_score: def.cvss_score };
      const effSev = getEffectiveSeverity(defVulnLike);
      const isManualOverride = hasManualSeverityOverride(defVulnLike);
      const vulnLock = getLockForRecord("vulnerability_definition", def.id);
      const lockedByOther = vulnLock && vulnLock.locked_by_user_id !== currentUserId;
      const affectedHosts = def.affected_host_ids.map((hid) => hosts.find((h) => h.id === hid)).filter(Boolean) as Host[];
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{def.title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <SeverityBadge severity={effSev} />
            {isManualOverride && <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Manually set</span>}
            {def.cvss_score != null && <span style={{ fontSize: 14 }}>CVSS {def.cvss_score}{isManualOverride ? " (overridden)" : ""}</span>}
            {def.cve_ids?.length ? <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{def.cve_ids.join(", ")}</span> : null}
          </div>
          {lockedByOther && <p style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>Locked by {vulnLock!.locked_by_username ?? "Unknown"}</p>}
          {lockError && <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16 }}>{lockError}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ fontSize: "1rem", margin: 0 }}>Affected hosts</h3>
            <AffectedHostBadge count={def.affected_host_ids.length} onClick={() => setManageAffectedHostsModal(def)} />
          </div>
          {(def.affected_subnet_ids?.length ?? 0) > 0 && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
              Applied to subnet(s): {subnets.filter((s) => def.affected_subnet_ids?.includes(s.id)).map((s) => s.cidr).join(", ")}
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
            {affectedHosts.map((h) => (
              <li key={h.id} style={{ marginBottom: 4 }}>
                <button type="button" className="theme-btn theme-btn-ghost" style={{ padding: "4px 0", textAlign: "left" }} onClick={() => setSelectedNode({ type: "host", id: h.id })}>
                  {h.ip}{h.dns_name ? ` (${h.dns_name})` : ""}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ marginBottom: 16, fontSize: 13, color: "var(--text-muted)" }}>
            <div>Discovered by: {def.discovered_by ?? "—"}</div>
            <div>First seen: {formatDate(def.created_at ?? null)}</div>
            <div>Last updated: {formatDate(def.updated_at ?? null)}</div>
          </div>
          {(def.description_md ?? "").trim() ? (
            <div className="note-markdown-content" style={{ lineHeight: 1.6, marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(def.description_md ?? "") || "" }} />
          ) : null}
          {(def.evidence_md ?? "").trim() ? (
            <>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Evidence / notes</h3>
              <div className="note-markdown-content" style={{ lineHeight: 1.6, marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(def.evidence_md ?? "") || "" }} />
            </>
          ) : null}
          <VulnAttachmentsSection vulnDefId={def.id} canEdit={!lockedByOther} onRefresh={refreshVulnDefinitions} />
        </div>
      );
    }
    if (selectedNode.type === "evidence")
      return <div style={{ padding: 24, color: "var(--text-muted)" }}>Evidence (coming soon)</div>;
    if (selectedNode.type === "jobs")
      return <div style={{ padding: 24, color: "var(--text-muted)" }}>Jobs (coming soon)</div>;

    if (selectedNode.type === "subnet") {
      const subnet = subnets.find((s) => s.id === selectedNode.id);
      if (!subnet) return null;
      const subnetHosts = hostsBySubnet[subnet.id] ?? [];
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>
            {subnet.cidr}
            {subnet.name && <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>({subnet.name})</span>}
          </h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{subnetHosts.length} host(s). Right-click for actions.</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {subnetHosts.map((h) => {
              const lock = getLockForRecord("host", h.id);
              return (
                <li key={h.id} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      padding: "10px 14px",
                      backgroundColor: lock ? "var(--lock-bg)" : "var(--bg-panel)",
                      borderRadius: 8,
                      border: lock ? "1px solid var(--lock-border)" : "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedNode({ type: "host", id: h.id })}
                  >
                    <ReachabilityDot status={h.status} />
                    <span style={{ marginLeft: 8, fontWeight: 600 }}>{h.ip}</span>
                    {h.dns_name ? <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{h.dns_name}</div> : <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>Unresolved</div>}
                    {lock && <span style={{ fontSize: 12, color: "var(--accent)", marginLeft: 8 }}>Locked by {lock.locked_by_username ?? "?"}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {subnetHosts.length === 0 && <p style={{ color: "var(--text-muted)" }}>No hosts yet.</p>}
        </div>
      );
    }

    if (selectedNode.type === "host" || selectedNode.type === "host-ports") {
      const host = hosts.find((h) => h.id === (selectedNode.type === "host" ? selectedNode.id : selectedNode.hostId));
      if (!host) return null;
      const ports = portsByHost[host.id] ?? [];
      const showPortList = selectedNode.type === "host-ports";
      return (
        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 8 }}>
            <ReachabilityDot status={host.status} />
            <span style={{ marginLeft: 8, fontSize: "1.25rem", fontWeight: 600 }}>{host.ip}</span>
          </div>
          {host.dns_name ? (
            <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{host.dns_name}</p>
          ) : (
            <p style={{ color: "var(--text-dim)", marginBottom: 16, fontStyle: "italic" }}>Unresolved</p>
          )}
          {lockError && <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16 }}>{lockError}</div>}
          {currentHostLock && (
            <p style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>
              Locked by: {currentHostLock.locked_by_username ?? "Unknown"}
            </p>
          )}
          {showPortList && (
            <>
              <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Ports</h3>
              {portsLoading.has(host.id) ? (
                <p style={{ color: "var(--text-muted)" }}>Loading…</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {ports.map((p) => (
                    <li key={p.id} style={{ marginBottom: 4 }}>
                      <button type="button" onClick={() => setSelectedNode({ type: "port", id: p.id })} className="theme-btn theme-btn-ghost" style={{ background: "none", border: "none", padding: "4px 0", textAlign: "left" }}>
                        {p.number}/{p.protocol}{p.service_name ? ` (${p.service_name})` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!portsLoading.has(host.id) && ports.length === 0 && <p style={{ color: "var(--text-muted)" }}>No ports.</p>}
            </>
          )}
        </div>
      );
    }

    if (selectedNode.type === "host-vulnerabilities") {
      const host = hosts.find((h) => h.id === selectedNode.hostId);
      if (!host) return null;
      const vulns = vulnsByHost[host.id] ?? [];
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Vulnerabilities — {host.ip}</h2>
          {vulnsLoading.has(host.id) ? (
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : vulns.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No vulnerabilities on this host.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {[...vulns].sort(compareBySeverity).map((v) => (
                <li
                  key={v.id}
                  style={{ marginBottom: 8, padding: 12, backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => setSelectedNode({ type: "vuln-instance", id: v.id })}
                >
                  <strong>{v.definition_title ?? v.id}</strong> <span style={{ color: "var(--text-muted)", fontSize: 12 }}>[{v.status}]</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (selectedNode.type === "host-notes") {
      const host = hosts.find((h) => h.id === selectedNode.hostId);
      if (!host) return null;
      const notes = notesByHost[host.id] ?? [];
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Notes — {host.ip}</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Right-click to add a note.</p>
          {notesLoading.has(host.id) ? (
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : notes.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No notes for this host.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {notes.map((n) => (
                <li
                  key={n.id}
                  style={{ marginBottom: 8, padding: 12, backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => setSelectedNode({ type: "note", id: n.id, target: "host", targetId: host.id })}
                >
                  {n.title || "Untitled"}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (selectedNode.type === "note") {
      const note =
        selectedNode.target === "scope"
          ? scopeNotes.find((n) => n.id === selectedNode.id)
          : selectedNode.target === "subnet"
            ? (notesBySubnet[selectedNode.targetId] ?? []).find((n) => n.id === selectedNode.id)
            : (notesByHost[selectedNode.targetId] ?? []).find((n) => n.id === selectedNode.id);
      if (!note) return <div style={{ padding: 24, color: "var(--text-muted)" }}>Note not found.</div>;
      const contextLabel =
        selectedNode.target === "scope"
          ? "Scope"
          : selectedNode.target === "subnet"
            ? (() => {
                const s = subnets.find((x) => x.id === selectedNode.targetId);
                return s ? `Subnet: ${s.cidr}${s.name ? ` (${s.name})` : ""}` : "Subnet";
              })()
            : (() => {
                const h = hosts.find((x) => x.id === selectedNode.targetId);
                return h ? `Host: ${h.ip}${h.dns_name ? ` (${h.dns_name})` : ""}` : "Host";
              })();
      const noteLock = getLockForRecord("note", note.id);
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{note.title || "Untitled Note"}</h2>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-muted)" }}>
            {contextLabel}
          </p>
          {noteLock && noteLock.locked_by_user_id !== currentUserId && (
            <p style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>Locked by {noteLock.locked_by_username ?? "Unknown"}</p>
          )}
          <div style={{ marginBottom: 16, fontSize: 13, color: "var(--text-muted)" }}>
            <div>Created by {note.created_by ?? "Unknown"} on {formatDate(note.created_at ?? null)}</div>
            <div>Last updated by {note.updated_by ?? "Unknown"} on {formatDate(note.updated_at ?? null)}</div>
          </div>
          <div
            className="note-markdown-content"
            style={{ lineHeight: 1.6, marginBottom: 24 }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body_md ?? "") || "<em>No content</em>" }}
          />
          {(note.attachments ?? []).length > 0 && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Attachments</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {(note.attachments ?? []).map((a) =>
                  a.type.startsWith("image/") ? (
                    <div key={a.id}>
                      <img src={a.url} alt={a.filename} style={{ maxWidth: 200, maxHeight: 150, objectFit: "contain", borderRadius: 6, border: "1px solid var(--border)" }} />
                      <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-muted)" }}>{a.filename}</div>
                    </div>
                  ) : (
                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="theme-link" style={{ display: "block" }}>
                      {a.filename}
                    </a>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (selectedNode.type === "vuln-instance") {
      const vuln = Object.values(vulnsByHost).flat().find((v) => v.id === selectedNode.id);
      if (!vuln) return <div style={{ padding: 24, color: "var(--text-muted)" }}>Select a vulnerability from the tree.</div>;
      const host = hosts.find((h) => h.id === vuln.host_id);
      const defFromList = vulnDefinitions.find((d) => d.id === vuln.vulnerability_definition_id);
      const affectedHosts = (defFromList?.affected_host_ids ?? [vuln.host_id]).map((hid) => hosts.find((h) => h.id === hid)).filter(Boolean) as Host[];
      const vulnLock = getLockForRecord("vulnerability_definition", vuln.vulnerability_definition_id);
      const lockedByOther = vulnLock && vulnLock.locked_by_user_id !== currentUserId;
      const effSev = getEffectiveSeverity(vuln);
      const isManualOverride = hasManualSeverityOverride(vuln);
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{vuln.definition_title ?? vuln.id}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <SeverityBadge severity={effSev} />
            {isManualOverride && <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Manually set</span>}
            {vuln.definition_cvss_score != null && <span style={{ fontSize: 14 }}>CVSS {vuln.definition_cvss_score}{isManualOverride ? " (overridden)" : ""}</span>}
            {vuln.definition_cve_ids?.length ? <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{vuln.definition_cve_ids.join(", ")}</span> : null}
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>[{vuln.status}]</span>
          </div>
          {lockedByOther && <p style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>Locked by {vulnLock!.locked_by_username ?? "Unknown"}</p>}
          {lockError && <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16 }}>{lockError}</div>}
          <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Affected hosts</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
            {affectedHosts.map((h) => (
              <li key={h.id} style={{ marginBottom: 4 }}>
                <button type="button" className="theme-btn theme-btn-ghost" style={{ padding: "4px 0", textAlign: "left" }} onClick={() => setSelectedNode({ type: "host", id: h.id })}>
                  {h.ip}{h.dns_name ? ` (${h.dns_name})` : ""}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ marginBottom: 16, fontSize: 13, color: "var(--text-muted)" }}>
            <div>Discovered by: {vuln.definition_discovered_by ?? "—"}</div>
            <div>First seen: {formatDate(vuln.definition_created_at ?? vuln.created_at ?? null)}</div>
            <div>Last updated: {formatDate(vuln.definition_updated_at ?? vuln.updated_at ?? null)}</div>
          </div>
          {(vuln.definition_description_md ?? "").trim() ? (
            <div className="note-markdown-content" style={{ lineHeight: 1.6, marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(vuln.definition_description_md ?? "") || "" }} />
          ) : null}
          {((vuln.definition_evidence_md ?? vuln.notes_md) ?? "").trim() ? (
            <>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Evidence / notes</h3>
              <div className="note-markdown-content" style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown((vuln.definition_evidence_md ?? vuln.notes_md) ?? "") || "" }} />
            </>
          ) : null}
        </div>
      );
    }

    if (selectedNode.type === "port") {
      let port: Port | null = null;
      let host: Host | null = null;
      for (const h of hosts) {
        const found = (portsByHost[h.id] ?? []).find((p) => p.id === selectedNode.id);
        if (found) {
          port = found;
          host = h;
          break;
        }
      }
      if (!port || !host) return null;
      const portLock = getLockForRecord("port", port.id);
      const lockedByOther = portLock && portLock.locked_by_user_id !== currentUserId;
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{port.number}/{port.protocol}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <span style={{ color: "var(--text-muted)", fontSize: 14 }}>Host: {host.ip}{host.dns_name ? ` (${host.dns_name})` : ""}</span>
            <span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 4, backgroundColor: "var(--bg-panel)", border: "1px solid var(--border)" }}>
              {port.state ?? "unknown"}
            </span>
            {port.service_name && (
              <span style={{ fontSize: 14 }}>Service: {port.service_name}</span>
            )}
          </div>
          {lockedByOther && (
            <p style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>
              Locked by {portLock!.locked_by_username ?? "Unknown"}
            </p>
          )}
          {lockError && (
            <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16 }}>{lockError}</div>
          )}
          <div style={{ marginBottom: 16, fontSize: 13, color: "var(--text-muted)" }}>
            <div>Discovered by: {port.discovered_by ?? "—"}</div>
            <div>First seen: {formatDate(port.created_at ?? null)}</div>
            <div>Last updated: {formatDate(port.updated_at ?? null)}</div>
          </div>
          {(port.description_md ?? "").trim() ? (
            <>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Description</h3>
              <div
                className="note-markdown-content"
                style={{ lineHeight: 1.6, marginBottom: 24 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(port.description_md ?? "") || "<em>No description</em>" }}
              />
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", fontStyle: "italic", marginBottom: 24 }}>No description. Right-click the port in the tree to edit.</p>
          )}
          {(port.evidence_md ?? "").trim() ? (
            <>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Evidence / Notes</h3>
              <div
                className="note-markdown-content"
                style={{ lineHeight: 1.6, marginBottom: 24 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(port.evidence_md ?? "") }}
              />
            </>
          ) : null}
          <PortAttachmentsSection portId={port.id} canEdit={!lockedByOther} onRefresh={() => loadPortsForHost(host.id)} />
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 57px)" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "12px 24px", backgroundColor: "var(--bg-panel)", color: "var(--text)", fontSize: 14, flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 600, color: scopeSeverity ? getSeverityColor(scopeSeverity) : undefined }}>{mission.name}</span>
        <span>Start: {formatDate(mission.start_date)}</span>
        <span>End: {formatDate(mission.end_date)}</span>
        <span>{daysRemaining(mission.end_date)} left</span>
        <Link href="/missions" className="theme-link" style={{ marginLeft: "auto" }}>Switch mission</Link>
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <aside style={treeStyle}>
          <div
            className="theme-tree-node"
            style={{ ...nodeStyle(0), paddingLeft: 12, fontWeight: 600, color: scopeSeverity ? getSeverityColor(scopeSeverity) : "var(--text)" }}
            onClick={() => toggleExpand("scope")}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: "Add Subnet", onClick: () => setAddSubnetModal(true) },
                  { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "scope" }) },
                  { label: "Import Hosts", onClick: () => setImportHostsModal({ type: "scope" }) },
                ],
              });
            }}
          >
            <span style={{ width: 14 }}>{expanded.has("scope") ? "▼" : "▶"}</span>
            Scope
          </div>
          {expanded.has("scope") && (
            <>
              <div
                className={"theme-tree-node" + (selectedNode?.type === "scope-notes" ? " selected" : "")}
                style={nodeStyle(1)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  toggleExpand("scope-notes", () => loadScopeNotes());
                  setSelectedNode({ type: "scope-notes" });
                }}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  if (!scopeNotesLoaded && !scopeNotesLoading) loadScopeNotes();
                  setContextMenu({
                    x: ev.clientX,
                    y: ev.clientY,
                    items: [{ label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "scope" }) }],
                  });
                }}
              >
                <span style={{ width: 14, textAlign: "center" }}>{expanded.has("scope-notes") ? "▼" : "▶"}</span>
                <span style={{ opacity: 0.8 }}>{ICON.notes}</span>
                <span>Notes</span>
                {scopeNotesLoading && <Spinner />}
                {scopeNotesLoaded && !scopeNotesLoading && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({scopeNotes.length})</span>}
              </div>
              {expanded.has("scope-notes") && (
                <>
                  {scopeNotesLoading ? (
                    <div className="theme-tree-node" style={{ ...nodeStyle(2), color: "var(--text-muted)" }}>Loading…</div>
                  ) : scopeNotes.length === 0 ? (
                    <div className="theme-tree-node" style={{ ...nodeStyle(2), color: "var(--text-dim)", fontStyle: "italic" }}>None</div>
                  ) : (
                    scopeNotes.map((n) => {
                      const isSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "scope";
                      const noteTitle = n.title || (n.body_md?.split("\n")[0]?.slice(0, 30) ?? "Untitled");
                      return (
                        <div
                          key={n.id}
                          className={"theme-tree-node" + (isSel ? " selected" : "")}
                          style={nodeStyle(2)}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedNode({ type: "note", id: n.id, target: "scope", targetId: missionId });
                          }}
                          onContextMenu={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            setContextMenu({
                              x: ev.clientX,
                              y: ev.clientY,
                              items: [
                                { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "scope", note: n }) },
                                { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "scope" }) },
                                { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "scope" }) },
                              ],
                            });
                          }}
                        >
                          <span style={{ width: 14 }}>•</span>
                          {noteTitle}{noteTitle.length >= 30 ? "…" : ""}
                        </div>
                      );
                    })
                  )}
                </>
              )}
              {subnets.map((s) => {
                const key = `subnet:${s.id}`;
                const isExp = expanded.has(key);
                const isSel = selectedNode?.type === "subnet" && selectedNode.id === s.id;
                const hostCount = (hostsBySubnet[s.id] ?? []).length;
                return (
                  <div key={s.id}>
                    <div
                      className={"theme-tree-node" + (isSel ? " selected" : "")}
                      style={{ ...nodeStyle(1), color: subnetSeverity(s.id) ? getSeverityColor(subnetSeverity(s.id)) : "var(--text)" }}
                      onClick={() => { toggleExpand(key); setSelectedNode({ type: "subnet", id: s.id }); }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          items: [
                            { label: "Add Host", onClick: () => setAddHostModal({ subnetId: s.id }) },
                            { label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "subnet", subnet: s }) },
                            { label: "Import Hosts", onClick: () => setImportHostsModal({ type: "subnet", id: s.id, cidr: s.cidr, name: s.name }) },
                            { label: "Rename", onClick: () => setRenameSubnetModal(s) },
                            { label: "Delete", onClick: () => setStubModal({ title: "Delete Subnet", message: "Coming soon (stub)" }) },
                          ],
                        });
                      }}
                    >
                      <span style={{ width: 14 }}>{isExp ? "▼" : "▶"}</span>
                      {s.cidr}
                      {s.name && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({s.name})</span>}
                      <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({hostCount})</span>
                    </div>
                    {isExp && (
                      <>
                        <div
                          className={"theme-tree-node" + (selectedNode?.type === "subnet-notes" && selectedNode.subnetId === s.id ? " selected" : "")}
                          style={nodeStyle(2)}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toggleExpand(`subnet-notes:${s.id}`);
                            setSelectedNode({ type: "subnet-notes", subnetId: s.id });
                          }}
                          onContextMenu={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            setContextMenu({
                              x: ev.clientX,
                              y: ev.clientY,
                              items: [{ label: "Add Note", onClick: () => setNoteModal({ mode: "add", target: "subnet", subnet: s }) }],
                            });
                          }}
                        >
                          <span style={{ width: 14, textAlign: "center" }}>{expanded.has(`subnet-notes:${s.id}`) ? "▼" : "▶"}</span>
                          <span style={{ opacity: 0.8 }}>{ICON.notes}</span>
                          <span>Notes</span>
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({(notesBySubnet[s.id] ?? []).length})</span>
                        </div>
                        {expanded.has(`subnet-notes:${s.id}`) && (
                          (notesBySubnet[s.id] ?? []).length === 0 ? (
                            <div className="theme-tree-node" style={{ ...nodeStyle(3), color: "var(--text-dim)", fontStyle: "italic" }}>None</div>
                          ) : (
                            (notesBySubnet[s.id] ?? []).map((n) => {
                              const isNoteSel = selectedNode?.type === "note" && selectedNode.id === n.id && selectedNode.target === "subnet" && selectedNode.targetId === s.id;
                              const noteTitle = n.title || (n.body_md?.split("\n")[0]?.slice(0, 30) ?? "Untitled");
                              return (
                                <div
                                  key={n.id}
                                  className={"theme-tree-node" + (isNoteSel ? " selected" : "")}
                                  style={nodeStyle(3)}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setSelectedNode({ type: "note", id: n.id, target: "subnet", targetId: s.id });
                                  }}
                                  onContextMenu={(ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    setContextMenu({
                                      x: ev.clientX,
                                      y: ev.clientY,
                                      items: [
                                        { label: "Edit", onClick: () => setNoteModal({ mode: "edit", target: "subnet", subnet: s, note: n }) },
                                        { label: "Delete", onClick: () => setDeleteNoteModal({ note: n, target: "subnet", subnet: s }) },
                                        { label: "Print Note", onClick: () => setNotePrintView({ note: n, target: "subnet", subnet: s }) },
                                      ],
                                    });
                                  }}
                                >
                                  <span style={{ width: 14 }}>•</span>
                                  {noteTitle}{noteTitle.length >= 30 ? "…" : ""}
                                </div>
                              );
                            })
                          )
                        )}
                        {(hostsBySubnet[s.id] ?? []).map((h) => renderTreeHost(h, 2))}
                      </>
                    )}
                  </div>
                );
              })}
              {(hostsBySubnet["_unassigned"] ?? []).map((h) => (
                <div key={h.id}>{renderTreeHost(h, 1)}</div>
              ))}
            </>
          )}
          <div
            className={"theme-tree-node" + (selectedNode?.type === "vulnerabilities" ? " selected" : "")}
            style={{ ...nodeStyle(0), paddingLeft: 12, marginTop: 8 }}
            onClick={(ev) => {
              ev.stopPropagation();
              toggleExpand("vulnerabilities", () => loadVulnDefinitions());
              setSelectedNode({ type: "vulnerabilities" });
            }}
            onContextMenu={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              if (!vulnDefinitionsLoaded && !vulnDefinitionsLoading) loadVulnDefinitions();
              setContextMenu({
                x: ev.clientX,
                y: ev.clientY,
                items: [{ label: "Add Vulnerability", onClick: () => setVulnModal({ mode: "add" }) }],
              });
            }}
          >
            <span style={{ width: 14 }}>{expanded.has("vulnerabilities") ? "▼" : "▶"}</span>
            <span style={{ opacity: 0.8 }}>{ICON.vulns}</span>
            Vulnerabilities
            {vulnDefinitionsLoading && <Spinner />}
            {vulnDefinitionsLoaded && !vulnDefinitionsLoading && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({vulnDefinitions.length})</span>}
          </div>
          {expanded.has("vulnerabilities") && (
            <>
              {vulnDefinitionsLoading ? (
                <div className="theme-tree-node" style={{ ...nodeStyle(1), color: "var(--text-muted)" }}>Loading…</div>
              ) : vulnDefinitions.length === 0 ? (
                <div className="theme-tree-node" style={{ ...nodeStyle(1), color: "var(--text-dim)", fontStyle: "italic" }}>None</div>
              ) : (
                [...vulnDefinitions].sort((a, b) => compareBySeverity({ definition_severity: a.severity, definition_cvss_score: a.cvss_score }, { definition_severity: b.severity, definition_cvss_score: b.cvss_score })).map((d) => {
                  const isSel = selectedNode?.type === "vuln-definition" && selectedNode.id === d.id;
                  const effSev = getEffectiveSeverity({ definition_severity: d.severity, definition_cvss_score: d.cvss_score });
                  return (
                    <div
                      key={d.id}
                      className={"theme-tree-node" + (isSel ? " selected" : "")}
                      style={{ ...nodeStyle(1), color: getSeverityColor(effSev) }}
                      onClick={(ev) => { ev.stopPropagation(); setSelectedNode({ type: "vuln-definition", id: d.id }); }}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        const firstInstance = Object.values(vulnsByHost).flat().find((v) => v.vulnerability_definition_id === d.id);
                        const editHost = hosts.find((x) => d.affected_host_ids?.includes(x.id));
                        setContextMenu({
                          x: ev.clientX,
                          y: ev.clientY,
                          items: [
                            { label: "Edit", onClick: () => setVulnModal({ mode: "edit", host: editHost ?? undefined, definition: d }) },
                            { label: "Delete", onClick: () => setDeleteVulnModal({ instance: { id: "", host_id: d.affected_host_ids?.[0] ?? "", vulnerability_definition_id: d.id, definition_title: d.title, definition_severity: d.severity, definition_cvss_score: d.cvss_score, definition_cve_ids: d.cve_ids ?? [], definition_description_md: d.description_md, definition_evidence_md: d.evidence_md, definition_discovered_by: d.discovered_by, port_id: null, status: "open" } }) },
                          ],
                        });
                      }}
                    >
                      <span style={{ width: 14 }}>•</span>
                      {d.title}
                      <AffectedHostBadge count={d.affected_host_ids.length} onClick={() => setManageAffectedHostsModal(d)} compact />
                    </div>
                  );
                })
              )}
            </>
          )}
          <div className={"theme-tree-node" + (selectedNode?.type === "evidence" ? " selected" : "")} style={{ ...nodeStyle(0), paddingLeft: 12 }} onClick={() => setSelectedNode({ type: "evidence" })}>
            <span style={{ width: 14 }}>▶</span>
            Evidence
          </div>
          <div className={"theme-tree-node" + (selectedNode?.type === "jobs" ? " selected" : "")} style={{ ...nodeStyle(0), paddingLeft: 12 }} onClick={() => setSelectedNode({ type: "jobs" })}>
            <span style={{ width: 14 }}>▶</span>
            Jobs
          </div>
        </aside>
        <main style={{ flex: 1, overflowY: "auto", backgroundColor: "var(--bg)", color: "var(--text)" }}>{renderDetailPane()}</main>
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
      {importHostsModal && <ImportHostsModal context={importHostsModal} onClose={() => setImportHostsModal(null)} onSuccess={() => {}} />}
      {addSubnetModal && <AddSubnetModal onClose={() => setAddSubnetModal(false)} onSubmit={handleCreateSubnet} />}
      {addHostModal && <AddHostModal subnetId={addHostModal.subnetId} subnets={subnets} onClose={() => setAddHostModal(null)} onSubmit={handleCreateHost} />}
      {renameSubnetModal && <RenameSubnetModal subnetCidr={renameSubnetModal.cidr} subnetName={renameSubnetModal.name} onClose={() => setRenameSubnetModal(null)} onSubmit={(cidr, name) => handleRenameSubnet(renameSubnetModal.id, cidr, name)} />}
      {renameHostModal && <RenameHostModal hostIp={renameHostModal.ip} hostDnsName={renameHostModal.dns_name} onClose={() => setRenameHostModal(null)} onSubmit={(ip, dnsName) => handleSaveHost(renameHostModal.id, ip, dnsName)} />}
      {portModal && (
        <PortModal
          hostId={portModal.host.id}
          hostIp={portModal.host.ip}
          mode={portModal.mode}
          port={portModal.port}
          canEdit={!portModal.port || (() => { const l = getLockForRecord("port", portModal.port!.id); return !l || l.locked_by_user_id === currentUserId; })()}
          existingPorts={(portsByHost[portModal.host.id] ?? []).map((p) => ({ number: p.number, protocol: p.protocol }))}
          onClose={() => setPortModal(null)}
          onSubmit={(data) =>
            portModal.mode === "add"
              ? handleCreatePort(portModal.host.id, data)
              : portModal.port
                ? handleUpdatePort(portModal.host.id, portModal.port.id, data)
                : Promise.resolve()
          }
          onRefresh={() => {
            if (portModal.port) loadPortsForHost(portModal.host.id);
          }}
        />
      )}
      {vulnModal && (
        <VulnerabilityModal
          missionId={missionId}
          hostId={vulnModal.host?.id ?? null}
          hostIp={vulnModal.host?.ip ?? null}
          hosts={hosts}
          subnets={subnets}
          portsByHost={portsByHost}
          mode={vulnModal.mode}
          canEdit={(() => {
            const defId = vulnModal.vuln?.vulnerability_definition_id ?? vulnModal.definition?.id;
            if (!defId) return true;
            const l = getLockForRecord("vulnerability_definition", defId);
            return !l || l.locked_by_user_id === currentUserId;
          })()}
          onRefresh={() => {
            refreshVulnDefinitions();
            hosts.forEach((h) => loadVulnsForHost(h.id));
          }}
          vuln={
            vulnModal.vuln
              ? (() => {
                  const def = vulnModal.definition ?? vulnDefinitions.find((d) => d.id === vulnModal.vuln!.vulnerability_definition_id);
                  return {
                    definition_id: vulnModal.vuln.vulnerability_definition_id,
                    title: vulnModal.vuln.definition_title ?? "",
                    severity: vulnModal.vuln.definition_severity ?? null,
                    cvss_score: vulnModal.vuln.definition_cvss_score ?? null,
                    cve_ids: vulnModal.vuln.definition_cve_ids ?? [],
                    description_md: vulnModal.vuln.definition_description_md ?? null,
                    evidence_md: vulnModal.vuln.definition_evidence_md ?? null,
                    discovered_by: vulnModal.vuln.definition_discovered_by ?? null,
                    port_id: vulnModal.vuln.port_id ?? null,
                    affected_subnet_ids: def?.affected_subnet_ids ?? [],
                    affected_host_ids: def?.affected_host_ids ?? [vulnModal.vuln.host_id],
                  };
                })()
              : vulnModal.definition
                ? {
                    definition_id: vulnModal.definition.id,
                    title: vulnModal.definition.title,
                    severity: vulnModal.definition.severity ?? null,
                    cvss_score: vulnModal.definition.cvss_score ?? null,
                    cve_ids: vulnModal.definition.cve_ids ?? [],
                    description_md: vulnModal.definition.description_md ?? null,
                    evidence_md: vulnModal.definition.evidence_md ?? null,
                    discovered_by: vulnModal.definition.discovered_by ?? null,
                    port_id: null,
                    affected_subnet_ids: vulnModal.definition.affected_subnet_ids ?? [],
                    affected_host_ids: vulnModal.definition.affected_host_ids ?? [],
                  }
                : undefined
          }
          onClose={() => setVulnModal(null)}
          onSubmit={(data) =>
            vulnModal.mode === "add"
              ? handleCreateVuln(data)
              : (vulnModal.vuln?.vulnerability_definition_id ?? vulnModal.definition?.id)
                ? handleUpdateVuln(vulnModal.vuln?.vulnerability_definition_id ?? vulnModal.definition!.id, data)
                : Promise.resolve()
          }
        />
      )}
      {manageAffectedHostsModal && (
        <ManageAffectedHostsModal
          vulnDefId={manageAffectedHostsModal.id}
          projectId={manageAffectedHostsModal.project_id}
          currentHostIds={manageAffectedHostsModal.affected_host_ids}
          affectedSubnetIds={manageAffectedHostsModal.affected_subnet_ids ?? []}
          hosts={hosts}
          subnets={subnets}
          onClose={() => setManageAffectedHostsModal(null)}
          onSuccess={() => {
            setManageAffectedHostsModal(null);
            refreshVulnDefinitions();
            hosts.forEach((h) => loadVulnsForHost(h.id));
          }}
        />
      )}
      {deleteVulnModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeleteVulnModal(null)}>
          <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete vulnerability</h2>
            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
              Delete &quot;{deleteVulnModal.instance.definition_title ?? "Vulnerability"}&quot;? This will remove it from all affected hosts. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setDeleteVulnModal(null)}>Cancel</button>
              <button type="button" className="theme-btn theme-btn-primary" style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }} onClick={() => handleDeleteVuln(deleteVulnModal.instance.vulnerability_definition_id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {deletePortModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeletePortModal(null)}>
          <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete port</h2>
            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
              Delete {deletePortModal.port.number}/{deletePortModal.port.protocol} on {deletePortModal.host.ip}? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setDeletePortModal(null)}>Cancel</button>
              <button type="button" className="theme-btn theme-btn-primary" style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }} onClick={() => handleDeletePort(deletePortModal.port.id, deletePortModal.host.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {notePrintView && (
        <NotePrintView
          noteTitle={notePrintView.note.title ?? null}
          contextLabel={
            notePrintView.target === "scope"
              ? "Scope"
              : notePrintView.target === "subnet" && notePrintView.subnet
                ? `Subnet: ${notePrintView.subnet.cidr}${notePrintView.subnet.name ? ` (${notePrintView.subnet.name})` : ""}`
                : notePrintView.host
                  ? `Host: ${notePrintView.host.ip}${notePrintView.host.dns_name ? ` (${notePrintView.host.dns_name})` : ""}`
                  : ""
          }
          bodyMd={notePrintView.note.body_md}
          attachments={(notePrintView.note.attachments ?? []).map((a) => ({ id: a.id, filename: a.filename, type: a.type, url: a.url }))}
          createdBy={notePrintView.note.created_by ?? "Unknown"}
          createdAt={formatDate(notePrintView.note.created_at ?? null)}
          updatedBy={notePrintView.note.updated_by ?? "Unknown"}
          updatedAt={formatDate(notePrintView.note.updated_at ?? null)}
          onClose={() => setNotePrintView(null)}
        />
      )}
      {deleteNoteModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeleteNoteModal(null)}>
          <div style={{ backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 24, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", color: "var(--error)" }}>Delete note</h2>
            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>Delete &quot;{deleteNoteModal.note.title || "Untitled"}&quot;? This cannot be undone.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="theme-btn theme-btn-ghost" onClick={() => setDeleteNoteModal(null)}>Cancel</button>
              <button
                type="button"
                className="theme-btn theme-btn-primary"
                style={{ backgroundColor: "var(--error)", borderColor: "var(--error)" }}
                onClick={() =>
                  handleDeleteNote(
                    deleteNoteModal.note,
                    deleteNoteModal.target,
                    deleteNoteModal.target === "scope" ? missionId : deleteNoteModal.target === "subnet" ? deleteNoteModal.subnet!.id : deleteNoteModal.host!.id
                  )
                }
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {stubModal && <StubModal title={stubModal.title} message={stubModal.message} onClose={() => setStubModal(null)} />}
      {toast && <Toast message={toast} />}
    </div>
  );
}
