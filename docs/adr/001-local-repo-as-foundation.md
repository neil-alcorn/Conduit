<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/adr/001-local-repo-as-foundation.md
# description: ADR for using the local git repo as the CONDUIT foundation layer.
# owner:       HUMAN
# update:      Amend only when the decision changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# ADR-001: Local Git Repo as CONDUIT Foundation Layer

Date: 2026-04
Status: Accepted

## Context

CONDUIT needs a mechanism to keep all developers synchronized on directives, highway context, and convoy state.

## Decision

The Local Orchestration Repo is the foundation layer. VS Code and ADO integrations build on top of it.

## Rationale

- IDE-agnostic
- Offline capable
- Auditable in git
- No vendor dependency
- Gate Sync makes staleness structurally visible
