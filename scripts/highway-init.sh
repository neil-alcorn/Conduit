#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        scripts/highway-init.sh
# description: Wrapper script for Highway Init workflow steps.
# owner:       BOTH
# update:      Manual when Highway Init behavior changes.
# schema:      highway-index/schema/repo-entry.schema.json
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_SLUG="${1:-}"

if [ -z "$REPO_SLUG" ]; then
  echo "usage: highway-init.sh <repo-slug>" >&2
  exit 1
fi

echo "Starting Highway Init for $REPO_SLUG"
echo "Next steps:"
echo "  1. Copy highway-index/repos/_template.yaml"
echo "  2. Create CONDUIT.md and CONTEXT.md in the target repo"
echo "  3. Validate and clear QUARANTINE"
