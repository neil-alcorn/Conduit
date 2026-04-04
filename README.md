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
