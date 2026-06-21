<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/enhancement/stages/06-qa-regression.md
# description: Stage 6 QA Regression directive delta for enhancement convoys.
# owner:       HUMAN
# update:      Manual when QA regression policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 6. Wider scope:** test the ENTIRE existing surface of the enhanced component — all flows that use it, not just paths sharing code with the change.
- **The Stage 2 Backward Compatibility section is the scope document** — test every behavior listed there, plus all callers of modified API contracts and visual regression for touched `.svelte` files. Gate 6 criteria unchanged from net-new.

# Stage 6 — QA Regression Directive (Enhancement)

> **Delta from net-new**: See `directives/net-new/stages/06-qa-regression.md` for the full base directive.
> This file documents only what DIFFERS for enhancement convoys.

## Recommended Model
**claude-sonnet-4-6** — Same as net-new.

## Key Difference: Regression Scope Must Include the Enhanced Component's Full Existing Surface

For net-new, regression scope is limited to features that share code with the new work. For enhancements, the regression scope must include the **entire existing surface of the component being enhanced**, not just the flows that share code.

Reason: an enhancement to a shared component can break callers that do not share test coverage with the new code path. The Stage 2 Backward Compatibility section is your scope document — test every behavior listed there.

Regression scope for an enhancement:
1. All user flows that use the enhanced component (not just the changed path)
2. All callers of any modified API contract (from the Backward Compatibility section)
3. Visual regression for any .svelte file touched (same as net-new)

## Gate 6 — No Changes

Same as net-new. The base directive is the full requirement.
