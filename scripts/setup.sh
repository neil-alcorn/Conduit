#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        scripts/setup.sh
# description: First-time local setup script for the CONDUIT local orchestration repo.
# owner:       BOTH
# update:      Manual when first-time setup behavior changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
set -e

echo 'CONDUIT Setup Starting...'
command -v git >/dev/null 2>&1 || { echo 'ERROR: git required'; exit 1; }
command -v go >/dev/null 2>&1 || { echo 'ERROR: Go required'; exit 1; }
command -v node >/dev/null 2>&1 || { echo 'ERROR: Node.js required'; exit 1; }

echo 'Building conduit CLI...'
cd cli && go build -o ../bin/conduit . && cd ..

echo 'Installing TypeScript dependencies...'
npm install --silent

if [ ! -f .conduit/config.yaml ]; then
  cp .conduit/config.yaml.example .conduit/config.yaml
fi

./bin/conduit --version
