// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/staleness.ts
// description: Staleness calculation for last_context_update date strings.
// owner:       BOTH
// update:      Manual when staleness threshold or date parsing changes.
// schema:      none
// last_update: 2026-04-10
// ─────────────────────────────────────────────────────────────────────

export const STALE_DAYS = 30;

/**
 * Returns the number of whole days elapsed since the given YYYY-MM-DD date string.
 * Returns Infinity if the string is empty, missing, or unparseable.
 */
export function daysSince(dateStr: string | undefined): number {
  if (!dateStr?.trim()) return Infinity;
  const parsed = Date.parse(dateStr.trim());
  if (isNaN(parsed)) return Infinity;
  const ms = Date.now() - parsed;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function formatReenrichmentOffer(dateStr: string | undefined, repoPath: string): string | null {
  const age = daysSince(dateStr);
  if (age <= STALE_DAYS) return null;
  const target = repoPath.trim() || '<repo-path>';
  return `re-enrichment offer: run conduit init ${target} --enrich, then conduit init ${target} --enrich --verify after CONTEXT.md is updated`;
}
