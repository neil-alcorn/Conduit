<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        agents/hooks/README.md
# description: Overview of lifecycle hooks used to preserve resumable agent sessions.
# owner:       HUMAN
# update:      Manual when hook behavior changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Agent Hooks

Hooks run at session boundaries and important state transitions.

They follow the approved resumable-work principle extracted from Gastown: if there is hook work to do, the hook runs before execution continues.
