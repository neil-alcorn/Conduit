<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/handoff.md
# description: Fast handoff guide for the next engineer or agent picking up the CONDUIT repo.
# owner:       BOTH
# update:      Update after each major implementation or architecture round.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Handoff

## Read In This Order

1. [README.md](/C:/Users/nalco/.codex/Conduit/README.md)
2. [CONDUIT.md](/C:/Users/nalco/.codex/Conduit/CONDUIT.md)
3. [docs/architecture.md](/C:/Users/nalco/.codex/Conduit/docs/architecture.md)
4. [docs/security-model.md](/C:/Users/nalco/.codex/Conduit/docs/security-model.md)
5. [docs/current-state.md](/C:/Users/nalco/.codex/Conduit/docs/current-state.md)
6. [docs/round-2-change-log.md](/C:/Users/nalco/.codex/Conduit/docs/round-2-change-log.md)

## If You Need To Understand Enforcement

- ingress sanitizer: [cli/internal/sanitizer/sanitizer.go](/C:/Users/nalco/.codex/Conduit/cli/internal/sanitizer/sanitizer.go)
- sanitizer rules: [security/sanitizer/patterns.yaml](/C:/Users/nalco/.codex/Conduit/security/sanitizer/patterns.yaml)
- Repo Signal enforcement: [cli/internal/signals/signals.go](/C:/Users/nalco/.codex/Conduit/cli/internal/signals/signals.go)
- session precheck: [agents/hooks/session-start.sh](/C:/Users/nalco/.codex/Conduit/agents/hooks/session-start.sh)

## If You Need To Understand Repo Structure

- Highway registry: [highway-index/index.yaml](/C:/Users/nalco/.codex/Conduit/highway-index/index.yaml)
- self-registration entry: [highway-index/repos/conduit.yaml](/C:/Users/nalco/.codex/Conduit/highway-index/repos/conduit.yaml)
- gate protocols: [gates/protocols](/C:/Users/nalco/.codex/Conduit/gates/protocols)
- directives: [directives](/C:/Users/nalco/.codex/Conduit/directives)
- Convoy templates: [convoys/active/_template](/C:/Users/nalco/.codex/Conduit/convoys/active/_template)

## If You Need To Understand Shared Contracts

- shared package repo: [C:\Users\nalco\.codex\Conduit-core](/C:/Users/nalco/.codex/Conduit-core)
- package entrypoint: [src/index.ts](/C:/Users/nalco/.codex/Conduit-core/src/index.ts)
- highway types: [src/types/highway.ts](/C:/Users/nalco/.codex/Conduit-core/src/types/highway.ts)
- gate types: [src/types/gate.ts](/C:/Users/nalco/.codex/Conduit-core/src/types/gate.ts)

## What Not To Assume

- do not assume gate or checkpoint commands are fully implemented
- do not assume `conduit-app` exists yet
- do not assume Go validation was run in this workspace
- do not assume policy-only files are enforced unless they are named in the security model docs
