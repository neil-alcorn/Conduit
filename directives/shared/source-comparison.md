<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/source-comparison.md
# description: Source comparison QA directive. Runs when source_comparison.enabled = true
#              in convoy.yaml. Verifies that absorbed/ported features are complete.
# owner:       HUMAN
# update:      Manual when comparison QA policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Runs when `source_comparison.enabled: true`**, as the final Stage 4 step after unit tests pass — verifies ported/absorbed features are complete.
- **Inventory every source feature**, map each to ABSORBED / PARTIAL / MISSING / DEFERRED-BY-DESIGN, compare data models and behavior, then write the gap report with severities.
- **BLOCKER:** data-model diffs risking silent corruption, or behavioral differences in financial/PII calculations — pause the gate, human decides.
- **Do NOT commit** — report findings; the Conduit window commits.

# Source Comparison QA Directive [AGENTIC]

> **When to load:** When `convoy.yaml` has `source_comparison.enabled: true`.
> **When to run:** As the final step of Stage 4 (QA Unit), after all unit tests pass.
> **Mode:** AGENTIC — use judgment to determine what's missing, partial, or correctly deferred.

---

## What This Produces

1. Feature inventory per source repo — every user-facing capability the source had
2. Absorption map — each feature mapped to: ABSORBED | PARTIAL | MISSING | DEFERRED-BY-DESIGN
3. Gap report — all MISSING/PARTIAL items with severity and recommendation
4. QA verdict addendum — updates the Stage 4 verdict with comparison findings

---

## ⛔ COMMIT DISCIPLINE

Do NOT commit. Report findings and wait for gate approval. The Conduit window commits.

---

## Step 1 — Read each source repo [AGENTIC]

For each source listed in `convoy.yaml → source_comparison.sources`:

1. Read the source repo's `CONDUIT.md` and `CONTEXT.md` if they exist
2. If not, read the source repo's `README.md` + `src/` directory structure
3. List every user-facing feature — routes, API endpoints, data entities, UI components
4. Note the data model (tables, key fields, relationships)

**Goal:** Build a complete feature inventory. Be thorough. If a source repo has 20 routes, list all 20.

---

## Step 2 — Map each feature to the destination repo [AGENTIC]

For each feature in the inventory:

| Source Feature | Source Location | Destination Status | Destination Location | Notes |
|---|---|---|---|---|
| Scenario management | planning-app/src/routes/scenarios | ABSORBED | dest-app/src/routes/plan/[scenarioId] | UUID IDs instead of integer |
| SQLite local storage | planning-app/src/lib/db.ts | DEFERRED-BY-DESIGN | N/A — migrated to PostgreSQL | Intentional architecture change |
| ... | ... | ... | ... | ... |

**Status definitions:**
- **ABSORBED** — feature exists in destination, behavior equivalent
- **PARTIAL** — feature exists but is incomplete, simplified, or missing edge cases
- **MISSING** — feature was in source, not found in destination, no documented reason
- **DEFERRED-BY-DESIGN** — intentionally not ported; reason must be documented in living-spec.md

---

## Step 3 — Data model comparison [AGENTIC]

For each source repo with a database:

1. List source tables and key fields
2. Find corresponding destination tables
3. Flag: renamed fields, dropped fields, type changes, missing tables

Pay special attention to:
- Numeric ID → UUID migrations (data type, foreign key chains)
- SQLite → PostgreSQL type differences (boolean, datetime, numeric)
- Fields that exist in source but have no destination equivalent

---

## Step 4 — Behavioral comparison (calculations and business logic) [AGENTIC]

For any ported utility functions or business logic:

1. Read the source implementation
2. Read the destination implementation
3. Verify: same inputs → same outputs
4. Flag any behavioral differences, even if intentional

This is especially critical for financial calculations (ROI, cash flow, capacity) where a silent logic change produces wrong numbers without failing tests.

---

## Step 5 — Write the gap report [AGENTIC]

```
SOURCE COMPARISON REPORT

Source repos reviewed: [list]
Features inventoried: N
Status breakdown: N ABSORBED | N PARTIAL | N MISSING | N DEFERRED-BY-DESIGN

GAPS REQUIRING ACTION:

[Feature name] — [Source location] — Severity: BLOCKER | MAJOR | MINOR
  Status: MISSING | PARTIAL
  Description: [What's missing and why it matters]
  Recommendation: [Port now | Defer to next convoy | Accept gap with documentation]

...

DEFERRED-BY-DESIGN (documented):
- [Feature] — [Reason] — [Where documented]

VERDICT ADDENDUM:
- Stage 4 QA verdict: [unchanged | CONDITIONAL PASS — resolve gaps before Gate 5]
- Blocking gaps: N
- Non-blocking gaps: N
```

---

## Severity Definitions

| Severity | Definition |
|---|---|
| **BLOCKER** | Missing feature breaks a shipped acceptance criterion or data integrity |
| **MAJOR** | Missing feature is user-visible, degrades the experience, but doesn't break existing ACs |
| **MINOR** | Missing edge case, UI polish, or convenience feature with a clear workaround |

BLOCKER gaps must be resolved before Gate 5 or explicitly accepted by the human with a documented reason.

---

## What to Escalate

- BLOCKER gap found → surface immediately, pause gate request, let human decide: port now vs. accept
- Data model diff that could cause silent data corruption → escalate as BLOCKER regardless of feature status
- Behavioral difference in financial or PII calculations → escalate as BLOCKER
