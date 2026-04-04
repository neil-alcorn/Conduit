#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        scripts/sync-all.sh
# description: Forces a full sync of all active convoys and Highway Index state.
# owner:       BOTH
# update:      Manual when sync orchestration changes.
# schema:      convoys/schema/convoy.schema.json
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "Running full CONDUIT sync..."
conduit sync
conduit status
