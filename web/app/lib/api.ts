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
