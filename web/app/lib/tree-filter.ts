/**
 * Client-side attribute-based filter for the mission Scope tree.
 * Parses simple expressions and evaluates match against hosts, ports, evidence, vulnerabilities.
 * Non-destructive, case-insensitive by default.
 */

import { SEVERITY_RANK } from "./severity";
import type { SeverityLevel } from "./severity";
import { getEffectiveSeverity } from "./severity";
import type { VulnLike } from "./severity";

export type FilterOp = "==" | "!=" | "contains" | "exists" | ">=" | "<=" | ">" | "<";

export interface ParsedFilter {
  attr: string;
  op: FilterOp;
  value?: string | number | boolean;
}

const SEVERITY_LEVELS = ["Critical", "High", "Medium", "Low", "Info"] as const;

function norm(s: string | null | undefined): string {
  return (s ?? "").toString().toLowerCase().trim();
}

function normVal(v: string | number | boolean): string | number | boolean {
  if (typeof v === "string") return v.toLowerCase().trim();
  return v;
}

/**
 * Parse a filter string into a single expression.
 * Examples:
 *   page_title != "authentication"
 *   response_code == 200
 *   service == "https"
 *   server contains "apache"
 *   screenshot exists
 *   unresolved == true
 *   online == true
 *   vuln.severity >= High
 */
export function parseFilter(input: string): ParsedFilter | null {
  const raw = input.trim();
  if (!raw) return null;

  const existsMatch = raw.match(/^(\w+(?:\.\w+)?)\s+exists$/i);
  if (existsMatch) {
    return { attr: existsMatch[1].toLowerCase(), op: "exists" };
  }

  const quotedMatch = raw.match(/^(\w+(?:\.\w+)?)\s*(==|!=|>=|<=|>|<|contains)\s*"([^"]*)"$/i);
  if (quotedMatch) {
    const [, attr, op, val] = quotedMatch;
    const num = /^\d+$/.test(val) ? parseInt(val, 10) : val;
    return { attr: attr!.toLowerCase(), op: op as FilterOp, value: num };
  }

  const unquotedMatch = raw.match(/^(\w+(?:\.\w+)?)\s*(==|!=|>=|<=|>|<|contains)\s+(\S+)$/i);
  if (unquotedMatch) {
    const [, attr, op, val] = unquotedMatch;
    let value: string | number | boolean = val!;
    if (val === "true") value = true;
    else if (val === "false") value = false;
    else if (/^\d+$/.test(val)) value = parseInt(val, 10);
    return { attr: attr!.toLowerCase(), op: op as FilterOp, value };
  }

  return { attr: "_smart", op: "contains", value: raw };
}

export type HostLike = { id: string; ip: string; dns_name: string | null; status: string | null; subnet_id: string | null; whois_data?: Record<string, unknown> | null };

/** Whois field keys in whois_data (backend) -> filter/report attr names */
const WHOIS_FIELD_MAP: Record<string, string> = {
  network: "network_name",
  asn: "asn",
  country: "country",
  cidr: "cidr",
  type: "network_type",
  registry: "asn_registry",
};
function getWhoisVal(w: Record<string, unknown> | null | undefined, field: string): string {
  if (!w || typeof w !== "object") return "";
  if (field === "network") {
    const v = (w.network_name ?? w.asn_description) ?? "";
    return String(v).trim();
  }
  if (field === "country") {
    const v = (w.country ?? w.asn_country) ?? "";
    return String(v).trim();
  }
  const key = WHOIS_FIELD_MAP[field] ?? field;
  const v = w[key];
  return v != null ? String(v).trim() : "";
}
export type PortLike = { id: string; number: number; protocol: string; state: string | null; service_name: string | null };
export type EvidenceLike = { id: string; caption: string | null; filename: string; mime: string | null; source: string | null };
export type VulnInstanceLike = VulnLike & { id: string; definition_title: string | null; host_id: string };

function evidenceCaptionFields(caption: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!caption) return out;
  const lower = caption.toLowerCase();
  const responseCodeMatch = caption.match(/response\s*code\s*:\s*(\d+)/i) || caption.match(/response_code\s*[=:]\s*(\d+)/i);
  if (responseCodeMatch) out["response_code"] = responseCodeMatch[1].trim();
  const serverMatch = caption.match(/server\s*:\s*([^\n]+)/i) || caption.match(/server\s*[=:]\s*([^\n]+)/i);
  if (serverMatch) out["server"] = serverMatch[1].trim();
  const titleMatch = caption.match(/title\s*:\s*([^\n]+)/i) || caption.match(/page\s*title\s*[=:]\s*([^\n]+)/i);
  if (titleMatch) out["page_title"] = titleMatch[1].trim();
  else out["page_title"] = caption;
  out["technology"] = caption;
  return out;
}

function evidenceMatches(filter: ParsedFilter, ev: EvidenceLike): boolean {
  const cap = ev.caption ?? ev.filename ?? "";
  const fields = evidenceCaptionFields(ev.caption ?? "");
  const source = norm(ev.source);
  const isScreenshot = !!(ev.mime && ev.mime.toLowerCase().startsWith("image/"));

  const attr = filter.attr;
  const val = filter.value;
  const vNorm = val !== undefined ? normVal(val) : undefined;

  if (attr === "_smart") {
    const search = (vNorm as string) ?? "";
    if (!search) return false;
    return norm(ev.caption ?? "").includes(search) || norm(ev.filename).includes(search) || source.includes(search);
  }
  if (attr === "page_title") {
    const t = norm(fields["page_title"] || cap);
    if (filter.op === "==") return t === (vNorm as string);
    if (filter.op === "!=") return t !== (vNorm as string);
    if (filter.op === "contains") return t.includes((vNorm as string) ?? "");
    return false;
  }
  if (attr === "response_code") {
    const code = fields["response_code"] ? parseInt(fields["response_code"], 10) : null;
    const numVal = typeof val === "number" ? val : parseInt(String(val), 10);
    if (filter.op === "==") return code !== null && code === numVal;
    if (filter.op === "!=") return code !== null && code !== numVal;
    if (filter.op === "contains") return code !== null && String(code).includes(String(vNorm));
    return false;
  }
  if (attr === "server") {
    const s = norm(fields["server"] || cap);
    if (filter.op === "==") return s === (vNorm as string);
    if (filter.op === "!=") return s !== (vNorm as string);
    if (filter.op === "contains") return s.includes((vNorm as string) ?? "");
    return false;
  }
  if (attr === "technology") {
    const t = norm(fields["technology"] || cap);
    if (filter.op === "==") return t === (vNorm as string);
    if (filter.op === "!=") return t !== (vNorm as string);
    if (filter.op === "contains") return t.includes((vNorm as string) ?? "");
    return false;
  }
  if (attr === "source") {
    if (filter.op === "==") return source === (vNorm as string);
    if (filter.op === "!=") return source !== (vNorm as string);
    if (filter.op === "contains") return source.includes((vNorm as string) ?? "");
    return false;
  }
  if (attr === "screenshot") {
    if (filter.op === "exists") return isScreenshot;
    if (filter.op === "==" && val === true) return isScreenshot;
    if (filter.op === "==" && val === false) return !isScreenshot;
    return false;
  }
  return false;
}

function portMatches(filter: ParsedFilter, p: PortLike): boolean {
  const attr = filter.attr;
  const val = filter.value;
  const vNorm = val !== undefined ? normVal(val) : undefined;

  if (attr === "_smart") {
    const search = (vNorm as string) ?? "";
    if (!search) return false;
    return String(p.number).includes(search) || norm(p.protocol).includes(search) || norm(p.service_name ?? "").includes(search);
  }
  if (attr === "port" || attr === "port_number") {
    const num = p.number;
    const numVal = typeof val === "number" ? val : parseInt(String(val), 10);
    if (filter.op === "==") return num === numVal;
    if (filter.op === "!=") return num !== numVal;
    if (filter.op === ">=") return num >= numVal;
    if (filter.op === "<=") return num <= numVal;
    if (filter.op === ">") return num > numVal;
    if (filter.op === "<") return num < numVal;
    return false;
  }
  if (attr === "protocol") {
    const s = norm(p.protocol);
    if (filter.op === "==") return s === (vNorm as string);
    if (filter.op === "!=") return s !== (vNorm as string);
    if (filter.op === "contains") return s.includes((vNorm as string) ?? "");
    return false;
  }
  if (attr === "service") {
    const s = norm(p.service_name ?? "");
    if (filter.op === "==") return s === (vNorm as string);
    if (filter.op === "!=") return s !== (vNorm as string);
    if (filter.op === "contains") return s.includes((vNorm as string) ?? "");
    return false;
  }
  if (attr === "state") {
    const s = norm(p.state ?? "");
    if (filter.op === "==") return s === (vNorm as string);
    if (filter.op === "!=") return s !== (vNorm as string);
    if (filter.op === "contains") return s.includes((vNorm as string) ?? "");
    return false;
  }
  return false;
}

function hostMatches(filter: ParsedFilter, h: HostLike): boolean {
  const attr = filter.attr;
  const val = filter.value;
  const vNorm = val !== undefined ? normVal(val) : undefined;
  const unresolved = norm(h.ip) === "unresolved";
  const statusNorm = norm(h.status ?? "");
  const online = statusNorm === "online" || statusNorm === "up";

  if (attr === "_smart") {
    const search = (vNorm as string) ?? "";
    if (!search) return false;
    return norm(h.ip).includes(search) || norm(h.dns_name ?? "").includes(search);
  }
  if (attr === "hostname" || attr === "dns_name") {
    const s = norm(h.dns_name ?? "");
    if (filter.op === "==") return s === (vNorm as string);
    if (filter.op === "!=") return s !== (vNorm as string);
    if (filter.op === "contains") return s.includes((vNorm as string) ?? "");
    return false;
  }
  if (attr === "ip") {
    const s = norm(h.ip);
    if (filter.op === "==") return s === (vNorm as string);
    if (filter.op === "!=") return s !== (vNorm as string);
    if (filter.op === "contains") return s.includes((vNorm as string) ?? "");
    return false;
  }
  if (attr === "unresolved" || attr === "resolved") {
    const target = attr === "unresolved";
    if (filter.op === "==") return (val === true && unresolved === target) || (val === false && unresolved !== target);
    if (filter.op === "exists") return unresolved === target;
    return false;
  }
  if (attr === "online" || attr === "offline") {
    const target = attr === "online";
    if (filter.op === "==") return (val === true && online === target) || (val === false && online !== target);
    if (filter.op === "exists") return online === target;
    return false;
  }
  if (attr === "status") {
    const s = statusNorm;
    if (filter.op === "==") return s === (vNorm as string);
    if (filter.op === "!=") return s !== (vNorm as string);
    if (filter.op === "contains") return s.includes((vNorm as string) ?? "");
    return false;
  }
  const whoisFields = ["whois_network", "whois_asn", "whois_country", "whois_cidr", "whois_type", "whois_registry"] as const;
  const whoisField = whoisFields.find((f) => attr === f);
  if (whoisField) {
    const field = whoisField.replace("whois_", "") as keyof typeof WHOIS_FIELD_MAP;
    const s = getWhoisVal(h.whois_data as Record<string, unknown> | null | undefined, field);
    if (filter.op === "exists") return s.length > 0;
    if (filter.op === "==") return s === (vNorm as string);
    if (filter.op === "!=") return s !== (vNorm as string);
    if (filter.op === "contains") return s.includes((vNorm as string) ?? "");
    return false;
  }
  return false;
}

function vulnMatches(filter: ParsedFilter, v: VulnInstanceLike): boolean {
  const attr = filter.attr;
  if (attr === "_smart") {
    const search = (filter.value !== undefined ? normVal(filter.value) : "") as string;
    if (!search) return false;
    const title = norm((v as { definition_title?: string }).definition_title ?? "");
    const sev = norm(getEffectiveSeverity(v) as string);
    return title.includes(search) || sev.includes(search);
  }
  if (attr === "vuln.severity" || attr === "severity") {
    const sev = getEffectiveSeverity(v) as SeverityLevel;
    const rank = SEVERITY_RANK[sev] ?? 0;
    const val = filter.value;
    if (typeof val === "string" && SEVERITY_LEVELS.includes(val as SeverityLevel)) {
      const targetRank = SEVERITY_RANK[val as SeverityLevel] ?? 0;
      if (filter.op === "==") return rank === targetRank;
      if (filter.op === "!=") return rank !== targetRank;
      if (filter.op === ">=") return rank >= targetRank;
      if (filter.op === "<=") return rank <= targetRank;
      if (filter.op === ">") return rank > targetRank;
      if (filter.op === "<") return rank < targetRank;
    }
    if (filter.op === "==") return norm(sev) === normVal(val);
    if (filter.op === "!=") return norm(sev) !== normVal(val);
    return false;
  }
  if (attr === "vuln.title" || attr === "title") {
    const t = norm((v as { definition_title?: string }).definition_title ?? "");
    const vNorm = filter.value !== undefined ? normVal(filter.value) : undefined;
    if (filter.op === "==") return t === (vNorm as string);
    if (filter.op === "!=") return t !== (vNorm as string);
    if (filter.op === "contains") return t.includes((vNorm as string) ?? "");
    return false;
  }
  if (attr === "vuln.cvss" || attr === "cvss") {
    const cvss = (v as { definition_cvss_score?: number }).definition_cvss_score ?? null;
    const numVal = typeof filter.value === "number" ? filter.value : parseFloat(String(filter.value));
    if (filter.op === "==") return cvss !== null && cvss === numVal;
    if (filter.op === "!=") return cvss !== null && cvss !== numVal;
    if (filter.op === ">=") return cvss !== null && cvss >= numVal;
    if (filter.op === "<=") return cvss !== null && cvss <= numVal;
    if (filter.op === ">") return cvss !== null && cvss > numVal;
    if (filter.op === "<") return cvss !== null && cvss < numVal;
    return false;
  }
  return false;
}

/** Check if a single evidence item matches the filter */
export function matchEvidence(filter: ParsedFilter, ev: EvidenceLike): boolean {
  return evidenceMatches(filter, ev);
}

/** Check if a single port matches the filter (port attributes only) */
export function matchPort(filter: ParsedFilter, p: PortLike): boolean {
  return portMatches(filter, p);
}

/** Check if a single host matches the filter (host attributes only) */
export function matchHost(filter: ParsedFilter, h: HostLike): boolean {
  return hostMatches(filter, h);
}

/** Check if a single vuln instance matches the filter */
export function matchVuln(filter: ParsedFilter, v: VulnInstanceLike): boolean {
  return vulnMatches(filter, v);
}
