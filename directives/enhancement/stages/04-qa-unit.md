<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/enhancement/stages/04-qa-unit.md
# description: Stage 4 QA Unit directive delta for enhancement convoys.
# owner:       HUMAN
# update:      Manual when QA policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 4. Dual coverage required:** every new/changed criterion tested AND every preserve criterion tested — the coverage matrix gets a second (preserve) table, and both must be fully covered to pass.
- **Verify test count ≥ Stage 3 baseline** — a decrease means tests were deleted, which blocks the gate unless each deletion is explicitly justified.

# Stage 4 — QA Unit Directive (Enhancement)

> **Delta from net-new**: See `directives/net-new/stages/04-qa-unit.md` for the full base directive.
> This file documents only what DIFFERS for enhancement convoys.

## Recommended Model
**claude-sonnet-4-6** — Same as net-new.

## Key Difference: Dual Coverage Required

Enhancement QA must verify two things, not one:

**1. New behavior coverage** — same as net-new: every new/changed acceptance criterion has a test.

**2. Preserve coverage** — every "preserve criterion" from Stage 1 has a test confirming existing behavior is unchanged.

The criterion coverage matrix (from the net-new directive) must include a second section:

| Preserve Criterion | Test File | Test Name | Status |
|---|---|---|---|
| Given existing flow X, when Y, then Z (unchanged) | existing.test.ts | `still works after enhancement` | PASS |

A QA pass for an enhancement requires both tables to be fully covered, not just the new behavior table.

## Additional Check: Baseline vs. Post-Enhancement Test Count

Verify the total test count matches or exceeds the baseline recorded at Stage 3 Step 1. A decrease in test count means tests were deleted — this is a gate blocker unless each deletion is explicitly justified.

## Gate 4 Addition (in addition to net-new checklist)

- [ ] Preserve criteria coverage table is populated
- [ ] Total test count ≥ Stage 3 baseline count (or deletions are explicitly justified)
