#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        gates/sync/gate-sync.sh
# description: Gate Sync script that refreshes orchestration state before every gate evaluation.
# owner:       AGENT
# update:      Do not modify — managed by CONDUIT CLI.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -e

CONDUIT_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
LOG="$CONDUIT_ROOT/gates/sync/gate-sync.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[$TIMESTAMP] Gate sync starting" >> "$LOG"

cd "$CONDUIT_ROOT"
git fetch origin main --quiet
git merge origin/main --ff-only --quiet || {
  echo "[$TIMESTAMP] SYNC FAILED: merge conflict — manual resolution required" >> "$LOG"
  exit 1
}

conduit index refresh --quiet
conduit convoy validate --all --quiet
echo "last_sync: $TIMESTAMP" > "$CONDUIT_ROOT/.conduit/sync.lock"
echo "[$TIMESTAMP] Gate sync complete" >> "$LOG"
echo "CONDUIT: Gate sync complete. Proceeding to gate evaluation."
