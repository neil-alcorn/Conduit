<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/maintenance/stages/06-qa-regression.md
# description: Stage 6 is skipped for maintenance convoys.
# owner:       HUMAN
# update:      Manual when stage policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Stage 6 is SKIPPED for maintenance convoys** — the full test suite run at Stage 4 serves as regression verification.
- No separate sweep is needed because maintenance adds no new user flows.

# Stage 6 — QA Regression (Maintenance)

**Stage 6 is skipped for maintenance convoys.**

Maintenance convoys use the full test suite run at Stage 4 as the regression verification.
A separate stage-6 regression sweep is not required because maintenance does not add new user flows.

See `directives/net-new/stages/06-qa-regression.md` for reference on what this stage covers in net-new convoys.
