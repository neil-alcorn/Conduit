#!/bin/bash
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        scripts/setup.sh
# description: First-time local setup script for the CONDUIT local orchestration repo.
#              Go dependency removed 2026-04-07. Node/TypeScript only.
# owner:       BOTH
# update:      Manual when first-time setup behavior changes.
# schema:      none
# last_update: 2026-04-07
# ─────────────────────────────────────────────────────────────────────
set -e

echo 'CONDUIT Setup Starting...'
command -v git  >/dev/null 2>&1 || { echo 'ERROR: git required'; exit 1; }
command -v node >/dev/null 2>&1 || { echo 'ERROR: Node.js required (v20+)'; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo 'ERROR: npm required'; exit 1; }

echo 'Installing dependencies...'
npm install --silent

echo 'Building conduit CLI...'
npm run build

if [ ! -f .conduit/config.yaml ]; then
  cp .conduit/config.yaml.example .conduit/config.yaml
fi

echo 'Verifying CLI...'
node dist/cli/src/index.js --version

echo ''
echo 'CONDUIT setup complete.'
echo 'Run conduit commands with: node dist/cli/src/index.js <command>'
echo 'Or add an alias: alias conduit="node $(pwd)/dist/cli/src/index.js"'
