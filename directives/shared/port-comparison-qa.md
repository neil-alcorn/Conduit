<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/port-comparison-qa.md
# description: Port Comparison QA directive. Verifies feature parity between a
#              ported module in a target app and its original source application.
#              Used when a target app absorbs a standalone source app.
# owner:       HUMAN
# update:      Manual when port QA policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Applies to absorption convoys** — verifying feature parity between a ported module in a target app and its standalone source app.
- **Inventory both sides from code (not docs), then status every source feature:** MATCH / ADAPTED / MISSING / DEFERRED / NOT PORTED. MISSING items are blockers unless formally deferred.
- **Verify calculations and business logic with identical inputs through both implementations**; compare schemas field by field (renames, type changes, lost relationships).
- **No `git commit` or `git push` during this stage** — produce the gap report and verdict (PARITY / PARTIAL PARITY / GAP FOUND); the Conduit window commits after gate approval.

# Port Comparison QA Directive

## Purpose

When a target app absorbs a module from a standalone source application, the porting process can
introduce gaps: features present in the original that were missed, behaviors that differ,
or data model changes that change how things work. This directive defines a structured
comparison between the source app and the target port.

**This directive is specific to absorption convoys. It is not a Conduit platform feature.**

## ⛔ COMMIT AUTHORITY — You are NOT authorized to commit or push

**You are NOT authorized to run `git commit` or `git push` in any repo during this stage.**

Complete the comparison, produce the gap report, and report to the human. The Conduit window commits after gate approval.

---

## What This Stage Produces

1. Feature inventory of the source application
2. Feature inventory of the target port
3. Gap report: features in source not in the target, behaviors that differ, schema differences
4. Verdict: PARITY / PARTIAL PARITY / GAP FOUND

---

## Step-by-Step Instructions

### Step 1 — Inventory the source application

For the source app:

- List all routes and what each does
- List all DB schema tables and key columns
- List all API endpoints (if any)
- List UI features visible to the user (forms, displays, interactions)
- Note any business rules embedded in the logic (e.g., capacity defaults, calculation formulas)

**Read the source app's code directly.** Do not rely on documentation — it may be stale.

### Step 2 — Inventory the target port

For the target ported module:

- List all routes and what each does
- List all DB schema tables and key columns (from the target schema)
- List all API endpoints
- List UI features
- Note any business rules

### Step 3 — Compare and produce gap report

For each item in the source inventory, check whether the target port:

| Status | Meaning |
|---|---|
| MATCH | Implemented in the target, behavior is equivalent |
| ADAPTED | Implemented in the target, behavior intentionally changed (document why) |
| MISSING | Present in source, not present in the target |
| DEFERRED | Present in source, explicitly deferred for a future convoy |
| NOT PORTED | Present in source, decided not to port (document why) |

**MISSING items are blockers** unless explicitly deferred with a documented decision.

### Step 4 — Calculation and business logic verification

For modules that implement calculations:

- Extract the formula from the source app
- Extract the formula from the target's port
- Run the same inputs through both and compare outputs
- Document any differences

For any module with financial or numeric formulas, verify each formula matches between the source app and the target port (e.g., ROI, net benefit, cumulative cash flow, lag offsets, utilization calculations).

### Step 5 — Data model comparison

Compare the source app's schema against the target's ported schema:

- Field names that changed (document the rename)
- Fields present in source but missing in the target
- Type changes (e.g., `integer` → `numeric` string in Drizzle)
- Relationships that changed (e.g., foreign key direction)
- Enum values that were renamed or removed

### Step 6 — Write the gap report

```
PORT COMPARISON VERDICT: [PARITY | PARTIAL PARITY | GAP FOUND]

Source app: [name + repo path]
Target module: [route prefix]
Comparison date: [YYYY-MM-DD]

MATCH: N features
ADAPTED: N features (see details)
MISSING: N features ← BLOCKERS if not deferred
DEFERRED: N features
NOT PORTED: N features

BLOCKERS (must resolve before release):
- [Feature] — [what's missing] — [which source file]

CONDITIONS (document before release):
- [Adaptation] — [why it was changed]

DEFERRED (tracked for future convoy):
- [Feature] — [convoy ID to address it]
```

---

## Gate Criteria

Before requesting gate approval, verify:

- [ ] Source app fully inventoried (all routes, schema, UI features)
- [ ] Target port fully inventoried
- [ ] Every source feature has a status (MATCH / ADAPTED / MISSING / DEFERRED / NOT PORTED)
- [ ] All MISSING items are either resolved or formally deferred with a documented decision
- [ ] Calculation formulas verified with matching test inputs (if applicable)
- [ ] Schema comparison complete with all differences documented
- [ ] Verdict written and attached to gate request

---

## Common Failure Modes

- **Only comparing routes, not business logic**: A route can exist in the target but implement the formula incorrectly.
- **Trusting documentation over code**: Always read the actual source code. READMEs lie.
- **Marking intentional adaptations as MATCH**: An adaptation is a deliberate change — document it so future agents know why the target differs from the source.
- **Skipping schema comparison**: A renamed column is invisible at the route level but breaks data portability.
