"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, wsUrl } from "../lib/api";

export type LockEntry = {
  id: string;
  record_type: string;
  record_id: string;
  locked_by_user_id: string;
  locked_by_username: string | null;
  expires_at: string;
};

export function useLockState(projectId: string | null) {
  const [locks, setLocks] = useState<LockEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const projectIdRef = useRef(projectId);

  const refreshLocks = useCallback(() => {
    if (!projectId) return;
    fetch(apiUrl(`/api/locks?project_id=${projectId}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: LockEntry[]) => setLocks(list))
      .catch(() => setLocks([]));
  }, [projectId]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLocks([]);
      return;
    }
    refreshLocks();

    const ws = new WebSocket(wsUrl("/ws"));
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", project_id: projectId }));
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "lock_changed") {
          refreshLocks();
        }
      } catch {
        // ignore
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {};
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId, refreshLocks]);

  const acquireLock = useCallback(
    async (recordType: string, recordId: string) => {
      if (!projectId) throw new Error("No project");
      const res = await fetch(apiUrl("/api/locks"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, record_type: recordType, record_id: recordId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to acquire lock");
      }
      await refreshLocks();
    },
    [projectId, refreshLocks]
  );

  const releaseLock = useCallback(
    async (lockId: string) => {
      const res = await fetch(apiUrl(`/api/locks/${lockId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to release lock");
      }
      await refreshLocks();
    },
    [refreshLocks]
  );

  const renewLock = useCallback(
    async (lockId: string) => {
      const res = await fetch(apiUrl(`/api/locks/${lockId}/renew`), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return;
      await refreshLocks();
    },
    [refreshLocks]
  );

  return { locks, acquireLock, releaseLock, renewLock, refreshLocks };
}
