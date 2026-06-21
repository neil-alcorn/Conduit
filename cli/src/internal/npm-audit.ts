// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/npm-audit.ts
// description: Pure-function helpers for parsing `npm audit --json` output,
//              deduping advisories by URL/GHSA, and rendering a markdown
//              table for gate-context bundles. Isolates the schema-drift-prone
//              parsing layer from spawn/IO so it can be fixture-tested.
// owner:       BOTH
// update:      Manual when npm audit JSON schema changes (see fixtures).
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

export interface AdvisoryRecord {
  url: string;
  title: string;
  severity: string;
  vulnerablePackage: string;
  range: string;
  topLevelChains: string[];
  ghsaId?: string;
}

interface NpmAuditAdvisoryObject {
  source?: number;
  name?: string;
  dependency?: string;
  title?: string;
  url?: string;
  severity?: string;
  range?: string;
}

type NpmAuditViaItem = string | NpmAuditAdvisoryObject;

interface NpmAuditEntry {
  name?: string;
  severity?: string;
  isDirect?: boolean;
  via?: NpmAuditViaItem[];
  effects?: string[];
  range?: string;
}

interface NpmAuditJson {
  vulnerabilities?: Record<string, NpmAuditEntry>;
}

const GHSA_PATTERN = /GHSA-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/i;

function extractGhsaId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = url.match(GHSA_PATTERN);
  return m ? m[0] : undefined;
}

function findTopLevelChains(start: string, vulns: Record<string, NpmAuditEntry>): string[] {
  const startEntry = vulns[start];
  if (!startEntry) return [start];

  const visited = new Set<string>();
  const directs = new Set<string>();
  const queue: string[] = [start];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const entry = vulns[cur];
    if (!entry) continue;
    if (entry.isDirect) {
      directs.add(cur);
      continue;
    }
    for (const eff of entry.effects ?? []) {
      if (!visited.has(eff)) queue.push(eff);
    }
  }

  if (directs.size === 0) {
    // Fall back to the originating package so the chain cell is never empty.
    return [start];
  }
  return [...directs].sort();
}

export function parseAuditJson(input: string | unknown): AdvisoryRecord[] {
  let data: NpmAuditJson;
  if (typeof input === 'string') {
    data = JSON.parse(input) as NpmAuditJson;
  } else if (input && typeof input === 'object') {
    data = input as NpmAuditJson;
  } else {
    return [];
  }

  const vulns = data.vulnerabilities ?? {};
  const records: AdvisoryRecord[] = [];

  for (const [pkgName, entry] of Object.entries(vulns)) {
    if (!entry || !Array.isArray(entry.via)) continue;
    for (const via of entry.via) {
      if (typeof via === 'string') continue;
      if (!via || typeof via !== 'object') continue;
      if (!via.url) continue;

      records.push({
        url: via.url,
        title: via.title ?? '',
        severity: (via.severity ?? entry.severity ?? 'unknown').toLowerCase(),
        vulnerablePackage: via.name ?? via.dependency ?? pkgName,
        range: via.range ?? entry.range ?? '*',
        topLevelChains: findTopLevelChains(pkgName, vulns),
        ghsaId: extractGhsaId(via.url),
      });
    }
  }

  return records;
}

export function dedupAdvisories(records: AdvisoryRecord[]): AdvisoryRecord[] {
  const byKey = new Map<string, AdvisoryRecord>();
  for (const r of records) {
    const key = r.url || r.ghsaId || `${r.vulnerablePackage}|${r.title}`;
    const existing = byKey.get(key);
    if (existing) {
      const merged = new Set<string>([...existing.topLevelChains, ...r.topLevelChains]);
      existing.topLevelChains = [...merged].sort();
    } else {
      byKey.set(key, { ...r, topLevelChains: [...r.topLevelChains] });
    }
  }
  return [...byKey.values()];
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function formatChains(chains: string[]): string {
  if (chains.length === 0) return '(none)';
  if (chains.length <= 3) return chains.join(', ');
  return chains.slice(0, 3).join(', ') + ` (+${chains.length - 3} more)`;
}

export function renderTable(records: AdvisoryRecord[]): string {
  if (records.length === 0) {
    return '0 advisories — clean\n';
  }

  const lines: string[] = [];
  lines.push('| # | Advisory | Severity | Vulnerable Package | Range | URL |');
  lines.push('|---|----------|----------|--------------------|-------|-----|');

  records.forEach((r, idx) => {
    const advisory = escapePipe(r.title || r.ghsaId || r.url || 'unknown');
    const range = escapePipe(r.range);
    lines.push(`| ${idx + 1} | ${advisory} | ${r.severity} | ${formatChains(r.topLevelChains)} | ${range} | ${r.url} |`);
  });

  return lines.join('\n') + '\n';
}

export function hasBlockingSeverity(records: AdvisoryRecord[], opts: { strict: boolean }): boolean {
  if (records.length === 0) return false;
  if (opts.strict) return true;
  return records.some(r => r.severity === 'high' || r.severity === 'critical');
}
