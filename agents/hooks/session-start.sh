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
SANITIZER_CLI="$CONDUIT_ROOT/dist/security/sanitizer/cli.js"
SANITIZER_LOG="$CONDUIT_ROOT/.conduit/sanitizer.log"

if [ -z "$CONVOY_ID" ]; then
  echo "CONDUIT: No convoy context set. Run: conduit convoy attach <CNV-XXXX>"
  exit 0
fi

HOOK_FILE="$CONDUIT_ROOT/agents/sessions/${WORKSTREAM_ID}.yaml"
if [ -f "$HOOK_FILE" ]; then
  echo "CONDUIT: Resuming session for $WORKSTREAM_ID"
  cat "$HOOK_FILE"
fi

LIVING_SPEC="$CONDUIT_ROOT/convoys/active/$CONVOY_ID/living-spec.md"
if [ -f "$LIVING_SPEC" ]; then
  INPUT_HASH="$(shasum -a 256 "$LIVING_SPEC" | awk '{print $1}')"
  if [ ! -f "$SANITIZER_CLI" ]; then
    printf '%s command=%s input_sha256=%s decision=%s patterns=%s\n' \
      "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      "agents/hooks/session-start.sh:living-spec" \
      "$INPUT_HASH" \
      "block" \
      "sanitizer_unavailable" >> "$SANITIZER_LOG"
    echo "CONDUIT: Session aborted - sanitizer unavailable: fail closed."
    exit 1
  fi

  SANITIZER_RESULT="$(node "$SANITIZER_CLI" "agents/hooks/session-start.sh:living-spec" < "$LIVING_SPEC")" || {
    printf '%s command=%s input_sha256=%s decision=%s patterns=%s\n' \
      "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      "agents/hooks/session-start.sh:living-spec" \
      "$INPUT_HASH" \
      "block" \
      "sanitizer_unavailable" >> "$SANITIZER_LOG"
    echo "CONDUIT: Session aborted - sanitizer unavailable: fail closed."
    exit 1
  }

  if echo "$SANITIZER_RESULT" | grep -q '"allowed":false'; then
    printf '%s command=%s input_sha256=%s decision=%s patterns=%s\n' \
      "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      "agents/hooks/session-start.sh:living-spec" \
      "$INPUT_HASH" \
      "block" \
      "$(printf '%s' "$SANITIZER_RESULT" | sed -n 's/.*"matches":\[\([^]]*\)\].*/\1/p')" >> "$SANITIZER_LOG"
    echo "CONDUIT: Session aborted - sanitizer blocked content in living-spec.md. Review .conduit/sanitizer.log for details."
    exit 1
  fi
fi

conduit context inject --convoy "$CONVOY_ID" --workstream "$WORKSTREAM_ID"
echo "CONDUIT: Session ready. Convoy: $CONVOY_ID | Workstream: $WORKSTREAM_ID"
