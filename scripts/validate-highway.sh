#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        scripts/validate-highway.sh
# description: Validates a CONDUIT.md file against the repo signal schema expectations.
# owner:       BOTH
# update:      Manual when highway validation behavior changes.
# schema:      highways/repo-signals.schema.yaml
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

TARGET="${1:-CONDUIT.md}"

if [ ! -f "$TARGET" ]; then
  echo "missing target file: $TARGET" >&2
  exit 1
fi

grep -q "## Repo Signals" "$TARGET"
echo "validated: $TARGET"
