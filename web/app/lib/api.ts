/**
 * API base URL for browser requests. Call API directly to avoid Next.js proxy issues.
 * Must be reachable from the browser (e.g. http://localhost:8000 when using Docker port mapping).
 */
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
  }
  return process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  return base ? `${base.replace(/\/$/, "")}${p}` : p;
}

export function wsUrl(path: string): string {
  const base = getApiBase();
  const wsBase = base.replace(/^http/, "ws");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${wsBase.replace(/\/$/, "")}${p}`;
}

/** Safely format FastAPI error detail (string, array of objects, or object) to a display string. */
export function formatApiErrorDetail(detail: unknown, fallback = "Request failed"): string {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = (detail as { msg?: unknown }[]).map((d) =>
      typeof d?.msg === "string" ? d.msg : (d != null ? JSON.stringify(d) : "")
    );
    return parts.filter(Boolean).join("; ") || fallback;
  }
  if (typeof detail === "object" && "msg" in detail && typeof (detail as { msg: unknown }).msg === "string") {
    return (detail as { msg: string }).msg;
  }
  return fallback;
}
