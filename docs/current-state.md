<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/current-state.md
# description: Current implementation status for CONDUIT, including working controls and remaining scaffold areas.
# owner:       BOTH
# update:      Update after any major implementation round.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Current State

## Working Now

- root scaffold and managed file headers
- Highway templates and example repos
- Convoy folder structure and living spec template
- Highway Index with self-registration for `conduit`
- Release Gate protocol definition
- ingress sanitization for `conduit convoy new`
- `living-spec.md` sanitizer precheck on session start
- Repo Signal parsing and runtime permission checks
- split Checkpoint persistence package with JSONL helpers
- `conduit validate highway`, `conduit validate convoy`, and `conduit validate all` command scaffolding
- `conduit-core` shared types, constants, schemas, ADO mappings, and gate-event DB schema surface

## Partially Implemented

- `conduit validate`
  Highway validation is useful and field-specific, but convoy validation is still intentionally narrow
- `conduit convoy new`
  creates files and updates the registry, but does not yet build full downstream Work Stream state
- gate/checkpoint command groups
  permission checks are enforced first, but the main business actions are still stubs

## Still Scaffolded

- real gate evaluation logic
- real gate approval mutation and audit append
- real checkpoint create/pass/fail/list implementation
- full convoy schema validation against JSON Schema
- real ADO REST operations
- real LeanIX sync
- `conduit-app`

## Environment Constraints Seen In This Workspace

- `go` is not installed, so Go build/test could not be run here
- Node build works
- Node's built-in test runner hits sandbox `spawn EPERM` in this environment, so direct smoke checks were used instead

## Recommended Next Step

The next high-value round is to implement the real gate/checkpoint mutations behind the now-enforced security boundaries, rather than broadening the surface area further.
