<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        README.md
# description: Entry point for developers using the CONDUIT local orchestration repo.
# owner:       HUMAN
# update:      Manual — updated when system capabilities change.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# CONDUIT — Local Orchestration Repo

CONDUIT is the AI-native software delivery orchestration system for Horace Mann.

This repo is the foundation layer every developer and agent works from.

## What This Repo Does

`conduit` is the local orchestration repo.

It defines:

- the CONDUIT operating model
- Convoy, Work Stream, and Checkpoint flow
- Highway templates and Repo Signal rules
- human Gates and Gate Sync behavior
- agent roles, hooks, and directive structure
- security ingress controls and baseline QA/security patterns

It does not contain the future dashboard or shared package internals. Those belong in `conduit-app` and `conduit-core`.

## Start Here

- [CONDUIT.md](/C:/Users/nalco/.codex/Conduit/CONDUIT.md): repo highway and Repo Signals for this repo
- [docs/architecture.md](/C:/Users/nalco/.codex/Conduit/docs/architecture.md): how the system is structured and how the major folders work together
- [docs/security-model.md](/C:/Users/nalco/.codex/Conduit/docs/security-model.md): security-first design, sanitizer flow, and Repo Signal enforcement
- [docs/current-state.md](/C:/Users/nalco/.codex/Conduit/docs/current-state.md): what is implemented now, what is scaffolded, and what is intentionally deferred
- [docs/handoff.md](/C:/Users/nalco/.codex/Conduit/docs/handoff.md): concise handoff for the next engineer or agent
- [docs/glossary.md](/C:/Users/nalco/.codex/Conduit/docs/glossary.md): canonical vocabulary
- [docs/eisenhower-initiative.md](/C:/Users/nalco/.codex/Conduit/docs/eisenhower-initiative.md): repo on-ramp program
- [docs/round-2-change-log.md](/C:/Users/nalco/.codex/Conduit/docs/round-2-change-log.md): most recent improvement round

## Quick Start

```bash
git clone [repo-url] conduit
cd conduit
chmod +x scripts/setup.sh && ./scripts/setup.sh
conduit status
```

## Before Every Work Session

```bash
conduit sync
```

## Current State

The repo now includes:

- enforced ingress sanitization for `conduit convoy new`
- fail-closed Repo Signal permission checks for repo-targeting CLI commands
- self-registration in the Highway Index
- Release Gate protocol definition
- split Checkpoint persistence package
- shared handoff and architecture documentation

The repo still has scaffolded command bodies in several places. See [docs/current-state.md](/C:/Users/nalco/.codex/Conduit/docs/current-state.md) for the exact boundary between working enforcement and placeholder workflow behavior.

## Key Concepts

See `docs/glossary.md` for all CONDUIT terminology.

See `docs/eisenhower-initiative.md` to on-ramp a new repo.

## Structure

- `cli/` The conduit CLI (Go)
- `directives/` Work Type Directives — what agents read
- `highways/` Highway document templates
- `convoys/` Active convoy registry
- `agents/` Agent role definitions and hooks
- `gates/` Gate protocols and sync scripts
- `integrations/` ADO and LeanIX integration configs
- `database/` PostgreSQL schema definitions

## Contributing

All changes to agent-managed files require human approval.

Run `conduit validate` before any commit.
