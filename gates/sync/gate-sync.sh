#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        gates/sync/gate-sync.sh
# description: Gate Sync script that refreshes orchestration state before every gate evaluation.
# owner:       AGENT
# update:      Do not modify — managed by CONDUIT CLI.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

CONDUIT_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
LOG="$CONDUIT_ROOT/gates/sync/gate-sync.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SYNC_REF="${CONDUIT_SYNC_REF:-HEAD}"
CONVOY_SCOPE="${CONDUIT_CONVOY_ID:-}"

echo "[$TIMESTAMP] Gate sync starting" >> "$LOG"

cd "$CONDUIT_ROOT"
git fetch origin main --quiet

if ! git rev-parse --verify "$SYNC_REF" >/dev/null 2>&1; then
  echo "[$TIMESTAMP] SYNC FAILED: ref '$SYNC_REF' is not available locally" >> "$LOG"
  exit 1
fi

TARGET_COMMIT="$(git rev-parse --short "$SYNC_REF")"
REMOTE_MAIN="$(git rev-parse --short origin/main)"

conduit index refresh --quiet

if [ -n "$CONVOY_SCOPE" ]; then
  conduit convoy validate "$CONVOY_SCOPE" --quiet
else
  conduit convoy validate --all --quiet
fi

cat > "$CONDUIT_ROOT/.conduit/sync.lock" <<EOF
last_sync: $TIMESTAMP
sync_ref: $SYNC_REF
sync_commit: $TARGET_COMMIT
remote_main: $REMOTE_MAIN
convoy_scope: ${CONVOY_SCOPE:-all}
EOF

if [ "$SYNC_REF" = "HEAD" ]; then
  echo "[$TIMESTAMP] Gate sync complete for current checkout $TARGET_COMMIT (remote main $REMOTE_MAIN)" >> "$LOG"
  echo "CONDUIT: Gate sync complete for current checkout. Proceeding to gate evaluation."
  exit 0
fi

if [ "$TARGET_COMMIT" != "$REMOTE_MAIN" ]; then
  echo "[$TIMESTAMP] Gate sync complete for pinned ref $TARGET_COMMIT while remote main is $REMOTE_MAIN" >> "$LOG"
  echo "CONDUIT: Gate sync complete for pinned ref $TARGET_COMMIT. Remote main is $REMOTE_MAIN."
  exit 0
fi

echo "[$TIMESTAMP] Gate sync complete for pinned ref $TARGET_COMMIT" >> "$LOG"
echo "CONDUIT: Gate sync complete for pinned ref $TARGET_COMMIT. Proceeding to gate evaluation."
