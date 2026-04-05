<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        gates/README.md
# description: Overview of CONDUIT gate types and evaluation flow.
# owner:       HUMAN
# update:      Manual when gate architecture changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Gates

Gates are human approval boundaries between stages.

Every gate runs Gate Sync before evaluation.

Nothing advances automatically past a gate.

## Gate Protocols Present

- Spec Gate
- Design Gate
- QA Gate
- Security Gate
- BP Gate
- Release Gate

## Key Files

- [gates/sync/gate-sync.sh](/C:/Users/nalco/.codex/Conduit/gates/sync/gate-sync.sh)
- [gates/protocols/release-gate.yaml](/C:/Users/nalco/.codex/Conduit/gates/protocols/release-gate.yaml)

See [docs/architecture.md](/C:/Users/nalco/.codex/Conduit/docs/architecture.md) and [docs/current-state.md](/C:/Users/nalco/.codex/Conduit/docs/current-state.md) for how gate protocols relate to current implementation status.
