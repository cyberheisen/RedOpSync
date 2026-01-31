import { NextRequest } from "next/server";
import { proxyToBackend } from "../../../lib/proxy";

export async function GET(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  return proxyToBackend(request, "auth/" + path.join("/"));
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  return proxyToBackend(request, "auth/" + path.join("/"));
}
