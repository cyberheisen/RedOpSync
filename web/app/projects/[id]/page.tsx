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
import { RenameHostModal } from "../../components/rename-host-modal";
import { RenameSubnetModal } from "../../components/rename-subnet-modal";
import { StubModal } from "../../components/stub-modal";
import { Toast } from "../../components/toast";

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
};

type VulnInstance = {
  id: string;
  host_id: string;
  definition_title: string | null;
  status: string;
};

type Note = {
  id: string;
  host_id: string | null;
  body_md: string | null;
};

type Project = {
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
  | { type: "host-notes"; hostId: string }
  | { type: "vulnerabilities" }
  | { type: "evidence" }
  | { type: "jobs" }
  | null;

const ICON = {
  ports: "▸",   // compact arrow/cable
  vulns: "⚠",
  notes: "≡",
} as const;

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

export default function EngagementWorkspacePage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [portsByHost, setPortsByHost] = useState<Record<string, Port[]>>({});
  const [vulnsByHost, setVulnsByHost] = useState<Record<string, VulnInstance[]>>({});
  const [notesByHost, setNotesByHost] = useState<Record<string, Note[]>>({});
  const [portsLoaded, setPortsLoaded] = useState<Set<string>>(new Set());
  const [vulnsLoaded, setVulnsLoaded] = useState<Set<string>>(new Set());
  const [notesLoaded, setNotesLoaded] = useState<Set<string>>(new Set());
  const [portsLoading, setPortsLoading] = useState<Set<string>>(new Set());
  const [vulnsLoading, setVulnsLoading] = useState<Set<string>>(new Set());
  const [notesLoading, setNotesLoading] = useState<Set<string>>(new Set());
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
  const [stubModal, setStubModal] = useState<{ title: string; message?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { locks, acquireLock, releaseLock, renewLock, refreshLocks } = useLockState(projectId);

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
      .then((notes: Note[]) => {
        setNotesByHost((prev) => ({ ...prev, [hostId]: notes }));
        setNotesLoaded((p) => new Set(p).add(hostId));
      })
      .finally(() => setNotesLoading((p) => { const n = new Set(p); n.delete(hostId); return n; }));
  }, [notesLoaded, notesLoading]);

  const loadData = useCallback(() => {
    setSelectedNode(null);
    setPortsByHost({});
    setVulnsByHost({});
    setNotesByHost({});
    setPortsLoaded(new Set());
    setVulnsLoaded(new Set());
    setNotesLoaded(new Set());
    Promise.all([
      fetch(apiUrl(`/api/projects/${projectId}`), { credentials: "include" }),
      fetch(apiUrl(`/api/subnets?project_id=${projectId}`), { credentials: "include" }),
      fetch(apiUrl(`/api/hosts?project_id=${projectId}`), { credentials: "include" }),
    ])
      .then(async ([projRes, subnetsRes, hostsRes]) => {
        if (!projRes.ok) throw new Error("Project not found");
        if (!subnetsRes.ok) throw new Error("Failed to load subnets");
        if (!hostsRes.ok) throw new Error("Failed to load hosts");
        const [proj, subnetList, hostList] = await Promise.all([projRes.json(), subnetsRes.json(), hostsRes.json()]);
        setProject(proj);
        setSubnets(subnetList);
        setHosts(hostList);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedHost =
    selectedNode?.type === "host" || selectedNode?.type === "host-ports" || selectedNode?.type === "host-vulnerabilities" || selectedNode?.type === "host-notes"
      ? hosts.find((h) => h.id === (selectedNode.type === "host" ? selectedNode.id : selectedNode.hostId)) ?? null
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

  const getLockForRecord = (recordType: string, recordId: string) =>
    locks.find((l) => l.record_type === recordType && l.record_id === recordId) ?? null;

  const currentHostLock = selectedHost ? getLockForRecord("host", selectedHost.id) : null;

  useEffect(() => {
    if (!selectedHost || !currentUserId) return;
    const lock = locks.find(
      (l) => l.record_type === "host" && l.record_id === selectedHost.id && l.locked_by_user_id === currentUserId
    );
    if (!lock) return;
    const interval = setInterval(() => renewLock(lock.id), 60_000);
    return () => clearInterval(interval);
  }, [selectedHost, locks, currentUserId, renewLock]);

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
          project_id: projectId,
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

  const handleCreateHost = async (ip: string, dnsName: string, subnetId: string | null) => {
    setLockError("");
    try {
      const res = await fetch(apiUrl("/api/hosts"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
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
          <Link href="/projects" className="theme-link">Switch project</Link>
        </div>
      </main>
    );
  if (!project) return null;

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

  const nodeStyle = (selected: boolean, depth: number) => ({
    padding: "4px 8px 4px " + (12 + depth * 12) + "px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    minHeight: 24,
    color: "var(--text)",
  } as React.CSSProperties);

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

    return (
      <div key={h.id}>
        <div
          className={"theme-tree-node" + (selectedNode?.type === "host" && selectedNode.id === h.id ? " selected" : "")}
          style={nodeStyle(false, baseDepth)}
          onClick={(ev) => {
            ev.stopPropagation();
            toggleExpand(hKey);
            setSelectedNode({ type: "host", id: h.id });
          }}
          onContextMenu={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            setContextMenu({
              x: ev.clientX,
              y: ev.clientY,
              items: [
                { label: "Add port", onClick: () => setStubModal({ title: "Add port", message: "Coming soon (stub)" }) },
                { label: "Add vulnerability", onClick: () => setStubModal({ title: "Add vulnerability", message: "Coming soon (stub)" }) },
                { label: "Add note", onClick: () => setStubModal({ title: "Add note", message: "Coming soon (stub)" }) },
                { label: "Rename host", onClick: () => setRenameHostModal(h) },
                { label: "Delete host", onClick: () => setStubModal({ title: "Delete host", message: "Coming soon (stub)" }) },
                { label: "Import hosts", onClick: () => setImportHostsModal({ type: "host", hostId: h.id, ip: h.ip }) },
              ],
            });
          }}
        >
          <span style={{ width: 14, display: "inline-block", textAlign: "center" }}>{hExp ? "▼" : "▶"}</span>
          <span style={{ fontWeight: 500 }}>{h.ip}</span>
          {!h.subnet_id && <span style={{ color: "var(--text-dim)", fontSize: 11 }}> (unassigned)</span>}
        </div>
        {hExp && (
          <>
            <div
              className={"theme-tree-node" + (selectedNode?.type === "host-ports" && selectedNode.hostId === h.id ? " selected" : "")}
              style={nodeStyle(false, baseDepth + 1)}
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
                  items: [
                    { label: "Add port", onClick: () => setStubModal({ title: "Add port", message: "Coming soon (stub)" }) },
                    { label: "Delete port", onClick: () => setStubModal({ title: "Delete port", message: "Select a port to delete (stub)" }) },
                  ],
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
                  <div className="theme-tree-node" style={{ ...nodeStyle(false, baseDepth + 2), color: "var(--text-muted)" }}>Loading…</div>
                ) : (
                  ports.map((p) => {
                    const isSel = selectedNode?.type === "port" && selectedNode.id === p.id;
                    return (
                      <div
                        key={p.id}
                        className={"theme-tree-node" + (isSel ? " selected" : "")}
                        style={nodeStyle(false, baseDepth + 2)}
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
                              { label: "Add port", onClick: () => setStubModal({ title: "Add port", message: "Coming soon (stub)" }) },
                              { label: "Delete port", onClick: () => setStubModal({ title: "Delete port", message: "Coming soon (stub)" }) },
                            ],
                          });
                        }}
                      >
                        <span style={{ width: 14 }}>•</span>
                        {p.protocol}/{p.number}
                        {p.service_name && <span style={{ color: "#718096", fontSize: 11 }}> {p.service_name}</span>}
                      </div>
                    );
                  })
                )}
              </>
            )}
            <div
              className={"theme-tree-node" + (selectedNode?.type === "host-vulnerabilities" && selectedNode.hostId === h.id ? " selected" : "")}
              style={nodeStyle(false, baseDepth + 1)}
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
                  items: [
                    { label: "Add vulnerability", onClick: () => setStubModal({ title: "Add vulnerability", message: "Coming soon (stub)" }) },
                    { label: "Link existing vulnerability", onClick: () => setStubModal({ title: "Link existing vulnerability", message: "Coming soon (stub)" }) },
                    { label: "Delete vulnerability instance", onClick: () => setStubModal({ title: "Delete vulnerability instance", message: "Select a vulnerability to delete (stub)" }) },
                  ],
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
                  <div className="theme-tree-node" style={{ ...nodeStyle(false, baseDepth + 2), color: "var(--text-muted)" }}>Loading…</div>
                ) : vulns.length === 0 ? (
                  <div className="theme-tree-node" style={{ ...nodeStyle(false, baseDepth + 2), color: "var(--text-dim)", fontStyle: "italic" }}>None</div>
                ) : (
                  vulns.map((v) => {
                    const isSel = selectedNode?.type === "vuln-instance" && selectedNode.id === v.id;
                    return (
                      <div
                        key={v.id}
                        className={"theme-tree-node" + (isSel ? " selected" : "")}
                        style={nodeStyle(false, baseDepth + 2)}
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
                              { label: "Add vulnerability", onClick: () => setStubModal({ title: "Add vulnerability", message: "Coming soon (stub)" }) },
                              { label: "Link existing vulnerability", onClick: () => setStubModal({ title: "Link existing vulnerability", message: "Coming soon (stub)" }) },
                              { label: "Delete vulnerability instance", onClick: () => setStubModal({ title: "Delete vulnerability instance", message: "Coming soon (stub)" }) },
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
              style={nodeStyle(false, baseDepth + 1)}
              onClick={(ev) => {
                ev.stopPropagation();
                if (!notesLoaded.has(h.id) && !notesLoading.has(h.id)) loadNotesForHost(h.id);
                setSelectedNode({ type: "host-notes", hostId: h.id });
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setContextMenu({
                  x: ev.clientX,
                  y: ev.clientY,
                  items: [
                    { label: "Add note", onClick: () => setStubModal({ title: "Add note", message: "Coming soon (stub)" }) },
                    { label: "Delete note", onClick: () => setStubModal({ title: "Delete note", message: "Coming soon (stub)" }) },
                  ],
                });
              }}
            >
              <span style={{ width: 14 }}>•</span>
              <span style={{ opacity: 0.8 }}>{ICON.notes}</span>
              <span>Notes</span>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderDetailPane = () => {
    if (!selectedNode) {
      return (
        <div style={{ padding: 24 }}>
          <p style={{ color: "var(--text-muted)" }}>Select a node from the tree. Right-click for actions.</p>
        </div>
      );
    }
    if (selectedNode.type === "vulnerabilities")
      return <div style={{ padding: 24, color: "var(--text-muted)" }}>Vulnerabilities (global, coming soon)</div>;
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
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Hosts in this scope. Right-click for actions.</p>
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
                    <span style={{ fontWeight: 600 }}>{h.ip}</span>
                    {h.dns_name && <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>({h.dns_name})</span>}
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
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>{host.ip}</h2>
          {host.dns_name && <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{host.dns_name}</p>}
          {!showPortList && (
            <>
              {lockError && <div style={{ padding: 12, backgroundColor: "var(--error-bg)", color: "var(--error)", borderRadius: 8, marginBottom: 16 }}>{lockError}</div>}
              {currentHostLock ? (
                <div style={{ marginBottom: 16, fontSize: 14, color: "var(--accent)" }}>
                  Locked by: {currentHostLock.locked_by_username ?? "Unknown"}
                  {currentHostLock.locked_by_user_id === currentUserId && (
                    <button type="button" onClick={() => { const l = locks.find((x) => x.record_type === "host" && x.record_id === host.id); if (l?.id) handleReleaseLock(l.id); }} className="theme-btn theme-btn-ghost" style={{ marginLeft: 12, padding: "4px 8px", fontSize: 12 }}>Release lock</button>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => handleAcquireLock("host", host.id)} className="theme-btn theme-btn-primary" style={{ marginBottom: 16 }}>Acquire lock to edit</button>
              )}
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Right-click host in tree to rename.</p>
            </>
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
                        {p.protocol}/{p.number}{p.service_name ? ` (${p.service_name})` : ""}
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
              {vulns.map((v) => (
                <li key={v.id} style={{ marginBottom: 8, padding: 12, backgroundColor: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)" }}>
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
          {notesLoading.has(host.id) ? (
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : notes.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No notes for this host.</p>
          ) : (
            <div style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{notes[0]?.body_md ?? ""}</div>
          )}
        </div>
      );
    }

    if (selectedNode.type === "vuln-instance") {
      const vuln = Object.values(vulnsByHost).flat().find((v) => v.id === selectedNode.id);
      if (!vuln) return <div style={{ padding: 24, color: "var(--text-muted)" }}>Select a vulnerability from the tree.</div>;
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>{vuln.definition_title ?? vuln.id}</h2>
          <p style={{ color: "var(--text-muted)" }}>Status: {vuln.status}</p>
          <p style={{ marginTop: 16, color: "var(--text-muted)" }}>Vulnerability detail (coming soon)</p>
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
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>{port.protocol}/{port.number}</h2>
          <p style={{ color: "var(--text-muted)" }}>Host: {host.ip}</p>
          {port.service_name && <p>Service: {port.service_name}</p>}
          {port.service_version && <p>Version: {port.service_version}</p>}
          <p style={{ marginTop: 16, color: "var(--text-muted)" }}>Port editing (coming soon)</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 57px)" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "12px 24px", backgroundColor: "var(--bg-panel)", color: "var(--text)", fontSize: 14, flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 600 }}>{project.name}</span>
        <span>Start: {formatDate(project.start_date)}</span>
        <span>End: {formatDate(project.end_date)}</span>
        <span>{daysRemaining(project.end_date)} left</span>
        <Link href="/projects" className="theme-link" style={{ marginLeft: "auto" }}>Switch project</Link>
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <aside style={treeStyle}>
          <div
            className="theme-tree-node"
            style={{ ...nodeStyle(false, 0), paddingLeft: 12, fontWeight: 600 }}
            onClick={() => toggleExpand("scope")}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: "Add subnet", onClick: () => setAddSubnetModal(true) },
                  { label: "Add host", onClick: () => setAddHostModal({ subnetId: null }) },
                  { label: "Import hosts", onClick: () => setImportHostsModal({ type: "scope" }) },
                ],
              });
            }}
          >
            <span style={{ width: 14 }}>{expanded.has("scope") ? "▼" : "▶"}</span>
            Scope
          </div>
          {expanded.has("scope") && (
            <>
              {subnets.map((s) => {
                const key = `subnet:${s.id}`;
                const isExp = expanded.has(key);
                const isSel = selectedNode?.type === "subnet" && selectedNode.id === s.id;
                return (
                  <div key={s.id}>
                    <div
                      className={"theme-tree-node" + (isSel ? " selected" : "")}
                      style={nodeStyle(false, 1)}
                      onClick={() => { toggleExpand(key); setSelectedNode({ type: "subnet", id: s.id }); }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          items: [
                            { label: "Add host", onClick: () => setAddHostModal({ subnetId: s.id }) },
                            { label: "Import hosts", onClick: () => setImportHostsModal({ type: "subnet", id: s.id, cidr: s.cidr, name: s.name }) },
                            { label: "Rename subnet", onClick: () => setRenameSubnetModal(s) },
                            { label: "Delete subnet", onClick: () => setStubModal({ title: "Delete subnet", message: "Coming soon (stub)" }) },
                          ],
                        });
                      }}
                    >
                      <span style={{ width: 14 }}>{isExp ? "▼" : "▶"}</span>
                      {s.cidr}
                      {s.name && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({s.name})</span>}
                    </div>
                    {isExp && (hostsBySubnet[s.id] ?? []).map((h) => renderTreeHost(h, 2))}
                  </div>
                );
              })}
              {(hostsBySubnet["_unassigned"] ?? []).map((h) => (
                <div key={h.id}>{renderTreeHost(h, 1)}</div>
              ))}
            </>
          )}
          <div className={"theme-tree-node" + (selectedNode?.type === "vulnerabilities" ? " selected" : "")} style={{ ...nodeStyle(false, 0), paddingLeft: 12, marginTop: 8 }} onClick={() => setSelectedNode({ type: "vulnerabilities" })}>
            <span style={{ width: 14 }}>▶</span>
            <span style={{ opacity: 0.8 }}>{ICON.vulns}</span>
            Vulnerabilities
          </div>
          <div className={"theme-tree-node" + (selectedNode?.type === "evidence" ? " selected" : "")} style={{ ...nodeStyle(false, 0), paddingLeft: 12 }} onClick={() => setSelectedNode({ type: "evidence" })}>
            <span style={{ width: 14 }}>▶</span>
            Evidence
          </div>
          <div className={"theme-tree-node" + (selectedNode?.type === "jobs" ? " selected" : "")} style={{ ...nodeStyle(false, 0), paddingLeft: 12 }} onClick={() => setSelectedNode({ type: "jobs" })}>
            <span style={{ width: 14 }}>▶</span>
            Jobs
          </div>
        </aside>
        <main style={{ flex: 1, overflowY: "auto", backgroundColor: "var(--bg)", color: "var(--text)" }}>{renderDetailPane()}</main>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {importHostsModal && (
        <ImportHostsModal
          context={importHostsModal}
          onClose={() => setImportHostsModal(null)}
          onSuccess={() => {}}
        />
      )}

      {addSubnetModal && (
        <AddSubnetModal
          onClose={() => setAddSubnetModal(false)}
          onSubmit={handleCreateSubnet}
        />
      )}

      {addHostModal && (
        <AddHostModal
          subnetId={addHostModal.subnetId}
          subnets={subnets}
          onClose={() => setAddHostModal(null)}
          onSubmit={handleCreateHost}
        />
      )}

      {renameSubnetModal && (
        <RenameSubnetModal
          subnetCidr={renameSubnetModal.cidr}
          subnetName={renameSubnetModal.name}
          onClose={() => setRenameSubnetModal(null)}
          onSubmit={(cidr, name) => handleRenameSubnet(renameSubnetModal.id, cidr, name)}
        />
      )}

      {renameHostModal && (
        <RenameHostModal
          hostIp={renameHostModal.ip}
          hostDnsName={renameHostModal.dns_name}
          onClose={() => setRenameHostModal(null)}
          onSubmit={(ip, dnsName) => handleSaveHost(renameHostModal.id, ip, dnsName)}
        />
      )}

      {stubModal && (
        <StubModal
          title={stubModal.title}
          message={stubModal.message}
          onClose={() => setStubModal(null)}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
