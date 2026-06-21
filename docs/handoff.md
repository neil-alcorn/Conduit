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

1. [README.md](../README.md)
2. [CONDUIT.md](../CONDUIT.md)
3. [docs/architecture.md](./architecture.md)
4. [docs/security-model.md](./security-model.md)
5. [docs/current-state.md](./current-state.md)
6. [docs/round-2-change-log.md](./round-2-change-log.md)

## If You Need To Understand Enforcement

- ingress sanitizer: `security/sanitizer/sanitize.ts` + `security/sanitizer/cli.ts`
- sanitizer rules: `security/sanitizer/patterns.yaml`
- Repo Signal enforcement: CLI permission checks in `cli/src/`
- session precheck: `agents/hooks/session-start.sh`

## If You Need To Understand Repo Structure

- Highway registry: `highway-index/index.yaml`
- self-registration entry: `highway-index/repos/conduit.yaml`
- gate protocols: `gates/protocols/`
- directives: `directives/`
- Convoy templates: `convoys/active/_template/`

## If You Need To Understand Shared Contracts

- shared package repo: `../conduit-core/` (optional sibling package; not required by this self-contained CLI)
- package entrypoint: `conduit-core/src/index.ts`
- highway types: `conduit-core/src/types/highway.ts`
- gate types: `conduit-core/src/types/gate.ts`

## What Not To Assume

- do not assume gate or checkpoint commands are fully implemented
- do not assume `conduit-app` exists yet
- do not assume `npm run build` or `npm test` was run in this workspace
- do not assume policy-only files are enforced unless they are named in the security model docs
