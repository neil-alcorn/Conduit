<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/round-2-change-log.md
# description: Round 2 change log and follow-up improvement list for the CONDUIT orchestration repo.
# owner:       BOTH
# update:      Update after each major hardening or architecture round.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Round 2 Change Log

## Completed

- Added `conduit validate` command scaffolding with `highway`, `convoy`, and `all` subcommands.
- Added `gates/protocols/release-gate.yaml` to define the Stage 8 Release Gate.
- Added `highway-index/repos/conduit.yaml` and registered the orchestration repo in `highway-index/index.yaml`.
- Wired the TypeScript sanitizer into the CLI ingress path through a fail-closed Go wrapper.
- Added a compiled sanitizer bridge at `security/sanitizer/cli.ts`.
- Enforced sanitizer checks in `conduit convoy new`.
- Added a sanitizer pre-check to `agents/hooks/session-start.sh`.
- Implemented Repo Signal parsing and fail-closed permission enforcement in `cli/internal/signals/signals.go`.
- Wired Repo Signal permission checks into gate and checkpoint command entry points.
- Split checkpoint persistence into `schema.go`, `jsonl.go`, `store.go`, and `store_test.go`.

## Future Improvements

- Replace placeholder gate and checkpoint command bodies with real state mutation and audit logging.
- Promote sanitizer logging to a structured JSONL audit format shared by CLI and hooks.
- Replace shell-based session-hook logging with the same shared logger used by the Go ingress wrapper.
- Add full convoy schema validation instead of the current targeted `bp_gate_required` consistency check.
- Add a real Go build/test pass in CI once the Go toolchain is available in the environment.
- Add executable deterministic QA/security verification lanes before enabling real agent execution.
