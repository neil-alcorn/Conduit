#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        agents/hooks/session-start.sh
# description: Hook that restores session context and injects highway documents when an agent session starts.
# owner:       AGENT
# update:      Managed by CONDUIT CLI — borrow approved resumable-hook pattern.
# schema:      agents/sessions/_template.yaml
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -e

CONDUIT_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
CONVOY_ID="${CONDUIT_CONVOY:-}"
WORKSTREAM_ID="${CONDUIT_WORKSTREAM:-}"

if [ -z "$CONVOY_ID" ]; then
  echo "CONDUIT: No convoy context set. Run: conduit convoy attach <CNV-XXXX>"
  exit 0
fi

HOOK_FILE="$CONDUIT_ROOT/agents/sessions/${WORKSTREAM_ID}.yaml"
if [ -f "$HOOK_FILE" ]; then
  echo "CONDUIT: Resuming session for $WORKSTREAM_ID"
  cat "$HOOK_FILE"
fi

conduit context inject --convoy "$CONVOY_ID" --workstream "$WORKSTREAM_ID"
echo "CONDUIT: Session ready. Convoy: $CONVOY_ID | Workstream: $WORKSTREAM_ID"
