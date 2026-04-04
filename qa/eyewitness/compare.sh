#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        qa/eyewitness/compare.sh
# description: Visual comparison wrapper that emits JSON and HTML report paths for QA Gate consumption.
# owner:       BOTH
# update:      Manual as comparison behavior evolves.
# schema:      qa/eyewitness/config.yaml
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

BASELINE="${1:-}"
CANDIDATE="${2:-}"
OUTPUT_DIR="${3:-qa/output}"

if [ -z "$BASELINE" ] || [ -z "$CANDIDATE" ]; then
  echo "usage: compare.sh <baseline-image> <candidate-image> [output-dir]" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
JSON_REPORT="$OUTPUT_DIR/report.json"
HTML_REPORT="$OUTPUT_DIR/report.html"

cat > "$JSON_REPORT" <<EOF
{
  "baseline": "$BASELINE",
  "candidate": "$CANDIDATE",
  "status": "not_implemented",
  "html_report": "$HTML_REPORT"
}
EOF

cat > "$HTML_REPORT" <<EOF
<html><body><h1>CONDUIT Visual Comparison</h1><p>Status: not implemented.</p></body></html>
EOF

echo "$JSON_REPORT"
