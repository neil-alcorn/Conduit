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

json_escape() {
  printf '%s' "$1" | sed \
    -e 's/\\/\\\\/g' \
    -e 's/"/\\"/g'
}

html_escape() {
  printf '%s' "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e "s/'/\&#39;/g" \
    -e 's/"/\&quot;/g'
}

if [ -z "$BASELINE" ] || [ -z "$CANDIDATE" ]; then
  echo "usage: compare.sh <baseline-image> <candidate-image> [output-dir]" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
JSON_REPORT="$OUTPUT_DIR/report.json"
HTML_REPORT="$OUTPUT_DIR/report.html"

cat > "$JSON_REPORT" <<EOF
{
  "baseline": "$(json_escape "$BASELINE")",
  "candidate": "$(json_escape "$CANDIDATE")",
  "status": "not_implemented",
  "html_report": "$(json_escape "$HTML_REPORT")"
}
EOF

cat > "$HTML_REPORT" <<EOF
<html><body><h1>CONDUIT Visual Comparison</h1><p>Status: not implemented.</p><p>Baseline: $(html_escape "$BASELINE")</p><p>Candidate: $(html_escape "$CANDIDATE")</p></body></html>
EOF

echo "$JSON_REPORT"
