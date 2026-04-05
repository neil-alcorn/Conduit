<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/architecture.md
# description: Searchable architecture overview for the CONDUIT orchestration repo.
# owner:       BOTH
# update:      Update when major repo responsibilities or boundaries change.
# schema:      none
# last_update: 2026-04-04
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

## Three-Repo Model

- `conduit`: orchestration repo, directives, hooks, gates, security ingress, Highway templates
- `conduit-core`: shared TypeScript types, schemas, constants, ADO mappings, shared database schema surface
- `conduit-app`: future dashboard/backend, not built in this round

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
  CLI entrypoint, command routing, Repo Signal enforcement, ingress sanitizer wrapper, Checkpoint persistence
- `highway-index/`
  registry of repos connected to CONDUIT, including this repo itself
- `convoys/`
  active and archived convoy state, living specs, audit logs
- `directives/`
  per-work-type and shared directive structure for agent guidance
- `highways/`
  templates and examples for `CONDUIT.md`, `CONTEXT.md`, and `QA/ACCEPTANCE.md`
- `agents/`
  role definitions, hooks, and session templates
- `gates/`
  gate protocol definitions and Gate Sync behavior
- `qa/`
  acceptance-oriented QA scaffolding and constrained visual QA wrappers
- `security/`
  sanitizer rule library, TypeScript sanitizer, and security scaffolding
- `integrations/`
  ADO and LeanIX integration scaffolds
- `docs/`
  handoff, glossary, architecture, status, and changelog docs

## Enforcement Boundaries

The most important runtime boundaries currently implemented are:

- external ingress content is sanitized before `conduit convoy new` writes files
- `session-start.sh` sanitizes `living-spec.md` before injecting context
- repo-targeting CLI commands check Repo Signals before proceeding
- Gate Sync records the sync ref and does not merge remote changes during approval

## What Is Still Stubbed

- real gate evaluation logic
- real checkpoint lifecycle mutations
- real convoy attach/list behavior
- full convoy schema validation
- real ADO and LeanIX sync behavior
- real dashboard/backend in `conduit-app`

For the exact implementation line, see [current-state.md](/C:/Users/nalco/.codex/Conduit/docs/current-state.md).
