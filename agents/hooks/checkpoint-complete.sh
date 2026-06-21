#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        agents/hooks/checkpoint-complete.sh
# description: Hook that persists session state when a checkpoint completes.
# owner:       AGENT
# update:      Managed by CONDUIT CLI as checkpoint lifecycle behavior evolves.
# schema:      agents/sessions/_template.yaml
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -e

CONDUIT_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
WORKSTREAM_ID="${CONDUIT_WORKSTREAM:-}"
SESSION_FILE="$CONDUIT_ROOT/agents/sessions/${WORKSTREAM_ID}.yaml"

if [ -n "$WORKSTREAM_ID" ]; then
  echo "last_checkpoint_completed: $(date -u +'%Y-%m-%dT%H:%M:%SZ')" >> "$SESSION_FILE"
fi
