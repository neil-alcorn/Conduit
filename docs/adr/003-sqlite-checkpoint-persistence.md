<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/adr/003-sqlite-checkpoint-persistence.md
# description: ADR for using SQLite plus JSONL for checkpoint persistence.
# owner:       HUMAN
# update:      Amend only when the decision changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# ADR-003: SQLite + JSONL for Checkpoint Persistence

Date: 2026-04
Status: Accepted

## Context

Checkpoint state must survive agent restarts locally and remain inspectable in git.

## Decision

Use SQLite for queryable local state and JSONL for append-only git-trackable audit records.

## Rationale

- Zero-config local persistence
- Diffable audit trail
- Approved pattern extracted from Gastown Beads persistence
