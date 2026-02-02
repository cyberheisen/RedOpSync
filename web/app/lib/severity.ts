/**
 * Shared severity constants and utilities for vulnerability display.
 * Manual Severity Override takes precedence over CVSS-derived severity.
 */

export const SEVERITY_LEVELS = ["Critical", "High", "Medium", "Low", "Info"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  Critical: "#ff3b3b",
  High: "#ff8c00",
  Medium: "#f5c542",
  Low: "#4aa3ff",
  Info: "#9aa0a6",
};

/** Rank for "most severe" comparison (higher = more severe). Exported for sorting. */
export const SEVERITY_RANK: Record<SeverityLevel, number> = {
  Critical: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Info: 1,
};

/** Check if a string is a valid severity level */
function isValidSeverity(s: string | null | undefined): s is SeverityLevel {
  return SEVERITY_LEVELS.includes(s as SeverityLevel);
}

/**
 * Map CVSS score to severity (used only when no manual override).
 * - Critical: 9.0 – 10.0
 * - High:     7.0 – 8.9
 * - Medium:   4.0 – 6.9
 * - Low:      0.1 – 3.9
 * - Info:     0.0 or informational-only
 */
export function cvssToSeverity(cvss: number | null | undefined): SeverityLevel {
  if (cvss == null) return "Info";
  if (cvss >= 9) return "Critical";
  if (cvss >= 7) return "High";
  if (cvss >= 4) return "Medium";
  if (cvss > 0) return "Low";
  return "Info";
}

export type VulnLike = {
  definition_severity?: string | null;
  definition_cvss_score?: number | null;
};

/**
 * Get effective severity for a vulnerability.
 * Manual override (definition_severity) wins; otherwise derive from CVSS.
 */
export function getEffectiveSeverity(vuln: VulnLike): SeverityLevel {
  if (vuln.definition_severity && isValidSeverity(vuln.definition_severity)) {
    return vuln.definition_severity;
  }
  return cvssToSeverity(vuln.definition_cvss_score);
}

/** True if the displayed severity comes from manual override */
export function hasManualSeverityOverride(vuln: VulnLike): boolean {
  return !!(vuln.definition_severity && isValidSeverity(vuln.definition_severity));
}

/** Get color for a severity level */
export function getSeverityColor(severity: SeverityLevel | null | undefined): string {
  if (severity && SEVERITY_COLORS[severity as SeverityLevel]) {
    return SEVERITY_COLORS[severity as SeverityLevel];
  }
  return "var(--text-muted)";
}

/**
 * Get the highest (most severe) severity from a list of vulns.
 * Returns null if no vulns or no effective severity.
 */
export function getHighestSeverity(vulns: VulnLike[]): SeverityLevel | null {
  if (!vulns.length) return null;
  let highest: SeverityLevel | null = null;
  let highestRank = 0;
  for (const v of vulns) {
    const s = getEffectiveSeverity(v);
    const r = SEVERITY_RANK[s];
    if (r > highestRank) {
      highestRank = r;
      highest = s;
    }
  }
  return highest;
}

/** Compare two VulnLike items for sort order (most severe first). Use with Array.prototype.sort. */
export function compareBySeverity(a: VulnLike, b: VulnLike): number {
  const ra = SEVERITY_RANK[getEffectiveSeverity(a)];
  const rb = SEVERITY_RANK[getEffectiveSeverity(b)];
  return rb - ra; // descending: Critical first
}
