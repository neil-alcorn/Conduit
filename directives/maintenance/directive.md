<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/maintenance/directive.md
# description: Master directive for maintenance convoys.
# owner:       HUMAN
# update:      Manual when the maintenance delivery policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Applies to maintenance convoys** — upkeep, refactoring, dependency updates, and operational/infra work.
- **Lighter-weight but still gated:** active stages are 00, 03, 04, 05, 08; Stages 1, 2, 6, 7 are skipped.
- Scope, type classification, and rollback plan are captured at Stage 0; no new functionality (that's enhancement) or broken-behavior fixes (that's bug-fix).

# Maintenance Directive

Use a lighter-weight but still gated CONDUIT path for upkeep, refactoring, and operational maintenance work.
