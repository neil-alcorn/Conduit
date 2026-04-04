#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        agents/hooks/gate-triggered.sh
# description: Hook that runs Gate Sync before gate evaluation begins.
# owner:       AGENT
# update:      Managed by CONDUIT CLI as gate-trigger behavior evolves.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -e

CONDUIT_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
"$CONDUIT_ROOT/gates/sync/gate-sync.sh"
