<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/architecture.md
# description: Searchable architecture overview for the CONDUIT orchestration repo.
# owner:       BOTH
# update:      Update when major repo responsibilities or boundaries change.
# schema:      none
# last_update: 2026-04-18
# ─────────────────────────────────────────────────────────────────────
-->

# Architecture

## Purpose

`conduit` is the local orchestration repo for CONDUIT.

It is the control plane that defines:

- how work is represented
- how agents are constrained
- how human approval is enforced
- how repo context is discovered
- how security checks happen before agent context is populated

## Two-Repo Model

- `conduit`: orchestration repo — CLI, directives, convoys, security, skills
- `conduit-core`: shared TypeScript types, DB schemas, constants, work-tracker field mappings

Dashboard/registry functionality is optional and provider-neutral — there is no bundled dashboard repo. An optional registry backend (configured via `CONDUIT_REGISTRY_URL` / `CONDUIT_REGISTRY_API_KEY`) can present system state when wired up.

## CLI

Core commands: `context`, `sync`, `init`, `convoy`, `gate`, `checkpoint`, `status`, `validate`, `plan`, `execute`, `review`, `debug`, `session`, `decompose`, `skill`, `qa`, `behaviors`

Built with:

- TypeScript strict (ES2022), Node.js 18+
- Single dependency (`js-yaml`)
- `node:test` for testing (no Jest, no Vitest)
- `fetch()` for all HTTP — no axios/got

## Core Runtime Concepts

- `Convoy`: one business objective tracked from intake to release
- `Work Stream`: one repo-scoped execution lane inside a Convoy
- `Checkpoint`: one atomic unit of work inside a Work Stream
- `Stage`: pipeline phase `0-8`
- `Gate`: human approval boundary between Stages
- `Gate Sync`: pre-gate refresh and validation step
- `Repo Signal`: repo-level control metadata in `CONDUIT.md`
- `Highway Init`: process that on-ramps a repo into the network

## Folder Map

- `cli/`
  Commands in `src/commands/`, internal modules in `src/internal/` (sanitizer, checkpoint, signals, work-tracker client, gate events, convoy events, tokens, staleness, config, bootstrap, UI, git-sync, behaviors, id-generator), tests in `src/tests/`
- `convoys/`
  `active/` (live convoys), `archive/` (closed convoys), `pending/` (queued convoys), `schema/` (checkpoint and workstream JSON schemas), `registry.yaml` (master index of all convoys)
- `directives/`
  `shared/` (13 directives: convoy-agent-behavior, gate-evaluator, verification-protocol, spec-driven-planning, autonomous-execution, code-review-protocol, debug-protocol, session-handoff, parallel-dispatch, tdd-protocol, convoy-discovery, port-comparison-qa, source-comparison), plus `net-new/`, `enhancement/`, `bug-fix/`, `maintenance/` (9 stage directives each: 00-intake through 08-release)
- `.claude/skills/`
  Bundled `conduit-*` launcher skills, synced to detected Claude/Codex skill homes by `conduit context`
- `security/`
  Sanitizer patterns (`sanitizer/patterns.yaml`), sanitizer module (`sanitizer/sanitize.ts`), sanitizer CLI (`sanitizer/cli.ts`), SAST rules (`sast/`)
- `highway-index/`
  Registry of repos connected to CONDUIT, including this repo itself
- `highways/`
  Templates and examples for `CONDUIT.md`, `CONTEXT.md`, and `ACCEPTANCE.md`
- `database/`
  Migration files and Drizzle schema definitions (convoys, checkpoints, gate-events, workstreams, highway-index, audience-scores)
- `docs/`
  Architecture, glossary, ADRs, concept docs, and status docs

## Enforcement Boundaries

The runtime boundaries currently enforced:

- **Repo Signal permission enforcement** — QUARANTINE / OBSERVE / READ-ONLY / ACTIVE permission levels, system class detection, and content signal enforcement (`ai_input` / `ai_modify` / `ai_train`). CLI commands check Repo Signals before proceeding.
- **Gate checkpoint protocol** — STOP at stage boundary, evaluate against gate criteria, require human approval before advancing. Gate Sync records the sync ref and does not merge remote changes during approval.
- **Sanitizer** — Prompt injection detection at convoy creation and skill creation. External ingress content is sanitized before `conduit convoy new` writes files.
- **Skill approval workflow** — Create skill, validate structure, sync to the optional registry, reviewer approval required before activation.
- **Token-aware context budgeting** — Per-file token estimates in `conduit context` and gate request assembly to stay within context window limits.

## Implementation Status

- **Gate / checkpoint / convoy commands**: LIVE — full lifecycle (create, request, approve, reject, skip, close, pause, resume, remove)
- **Work-tracker sync**: PLACEHOLDER — `conduit sync` is a stub in this build (no live tracker integration)
- **Planning and execution**: LIVE — `conduit plan`, `conduit execute`, `conduit review`, `conduit debug`
- **Skills governance**: LIVE — create, validate, sync, approve via `conduit skill`
- **Optional registry**: provider-neutral sync backend (`CONDUIT_REGISTRY_URL` / `CONDUIT_REGISTRY_API_KEY`); optional and off by default
- **Session handoff**: LIVE — `conduit session save` / `resume` / `list`
- **Decomposition**: LIVE — `conduit decompose` for work item breakdown
- **QA**: LIVE — `conduit qa`
- **Behaviors**: LIVE — `conduit behaviors` for behavior tracking

For detailed current-state information, see [current-state.md](./current-state.md).
