<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/net-new/directive.md
# description: Master directive for net-new convoys.
# owner:       HUMAN
# update:      Manual when the net-new delivery policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Applies to net-new convoys** (new capability delivery).
- **Run the full CONDUIT pipeline** — explicit design, QA, security, BP, and release checkpoints; no stage skips.
- Load the per-stage directive under `directives/net-new/stages/` for the current stage.

# Net New Directive

Use the full CONDUIT pipeline for new capability delivery, with explicit design, QA, security, BP, and release checkpoints.
