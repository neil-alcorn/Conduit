<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/README.md
# description: Overview of Work Type Directives and shared agent prompts.
# owner:       HUMAN
# update:      Manual when directive structure or policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Directives define what agents do at each stage for each work type** (net-new, enhancement, bug-fix, maintenance, digital).
- Each work-type folder has a master `directive.md` plus per-stage prompts; non-net-new stage files are deltas on the net-new base.
- `directives/shared/` holds cross-work-type protocols (gate evaluation, TDD, handoffs, convoy agent behavior) — load the relevant one when its trigger applies.

# Work Type Directives

Directives define what agents do at each stage for each CONDUIT work type.

Shared prompts in `directives/shared/` apply across work types.

Each work type folder contains a master directive, stage-by-stage prompts, and flow targets.
