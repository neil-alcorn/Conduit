#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        qa/eyewitness/capture.sh
# description: Headless screenshot capture wrapper adapted from the approved EyeWitness browser-invocation pattern.
# owner:       BOTH
# update:      Manual as capture behavior evolves.
# schema:      qa/eyewitness/config.yaml
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

TARGET_URL="${1:-}"
OUTPUT_DIR="${2:-qa/output}"

if [ -z "$TARGET_URL" ]; then
  echo "usage: capture.sh <target-url> [output-dir]" >&2
  exit 1
fi

TIMESTAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
HASH="$(printf '%s' "$TARGET_URL" | shasum | awk '{print $1}' | cut -c1-12)"
SCREEN_DIR="$OUTPUT_DIR/screens"
SOURCE_DIR="$OUTPUT_DIR/source"
mkdir -p "$SCREEN_DIR" "$SOURCE_DIR"

SCREENSHOT_PATH="$SCREEN_DIR/${TIMESTAMP}-${HASH}.png"
SOURCE_PATH="$SOURCE_DIR/${TIMESTAMP}-${HASH}.html"

echo "CONDUIT capture target: $TARGET_URL"
echo "screenshot_path: $SCREENSHOT_PATH"
echo "source_path: $SOURCE_PATH"
echo "status: not_implemented"
