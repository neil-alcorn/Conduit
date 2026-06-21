// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/directive-checklist.ts
// description: Pure-function parser for stage-directive `## Gate N Criteria
//              (Pre-Gate Checklist)` sections. Extracts items declared as
//              `- [ ] **<check-id>**: <label>` so `conduit pre-gate` (CLI-2)
//              can dispatch each declared check to its executor.
//              Items without the **id**: prefix are silently skipped per
//              AC-9 backward-compat — legacy directives still work.
//              Optional `(timeout: Ns)` annotation between `**id**` and `:`
//              exposes a per-check timeout override (defect #3 — Stage 2
//              Decisions Log entry "per-check timeout override syntax").
//              Malformed annotations fall back to the executor's default.
// owner:       BOTH
// update:      Manual when directive checklist convention changes.
// schema:      none
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  label: string;
  /**
   * Optional per-check timeout override in milliseconds, parsed from
   * `(timeout: Ns)` annotation in the directive markdown.
   * When undefined, the executor uses its compiled-in default
   * (600s for `tests`, 120s for everything else).
   */
  timeoutMs?: number;
}

const CHECKLIST_ITEM = /^-\s*\[\s*\]\s*\*\*([a-z][a-z0-9-]*)\*\*\s*(\([^)]*\))?\s*:\s*(.+?)\s*$/;
const TIMEOUT_ANNOTATION = /^\(\s*timeout:\s*(\d+)\s*s\s*\)$/;

/**
 * Locate the `## Gate <gateNum> Criteria` section in the directive markdown
 * and return every item declared with the `**check-id**: label` convention.
 * Items not in that form are silently skipped (AC-9 backward-compat).
 *
 * Returns `[]` when the directive has no matching gate section, OR has the
 * section but no prefixed items.
 */
export function parseDirectiveChecklist(directiveContent: string, gateNum: number): ChecklistItem[] {
  const lines = directiveContent.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+Gate\\s+${gateNum}\\s+Criteria\\b`);

  let inSection = false;
  const items: ChecklistItem[] = [];

  for (const line of lines) {
    if (!inSection) {
      if (headingPattern.test(line)) inSection = true;
      continue;
    }
    // Stop at any next H2.
    if (/^##\s+/.test(line) && !headingPattern.test(line)) break;

    const m = line.match(CHECKLIST_ITEM);
    if (!m) continue;

    const item: ChecklistItem = { id: m[1], label: m[3] };
    if (m[2]) {
      const t = m[2].match(TIMEOUT_ANNOTATION);
      if (t) {
        item.timeoutMs = Number.parseInt(t[1], 10) * 1000;
      }
      // Malformed annotation (e.g., `(timeout: 600)` missing `s`, or
      // `(timeout: invalid)`) silently falls through to no override —
      // the executor will use its compiled-in default.
    }
    items.push(item);
  }

  return items;
}
