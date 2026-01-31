import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function proxyToBackend(
  request: NextRequest,
  path: string,
): Promise<NextResponse> {
  const url = `${API_BASE.replace(/\/$/, "")}/api/${path}`;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") return;
    headers.set(key, value);
  });
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.text();
  const res = await fetch(url, { method: request.method, headers, body });
  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "transfer-encoding" || lower === "connection" || lower === "set-cookie") return;
    responseHeaders.set(key, value);
  });
  if (typeof res.headers.getSetCookie === "function") {
    res.headers.getSetCookie().forEach((c: string) => responseHeaders.append("Set-Cookie", c));
  } else if (res.headers.get("set-cookie")) {
    responseHeaders.set("Set-Cookie", res.headers.get("set-cookie")!);
  }
  return new NextResponse(res.body, { status: res.status, statusText: res.statusText, headers: responseHeaders });
}
