#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Conduit — new-user install script
#
# Takes a fresh machine from zero to a working Conduit install:
#   1. Clones the conduit repo into a destination directory (configurable)
#   2. Builds the CLI
#   3. Seeds .conduit/config.yaml from config.yaml.example (prompts for
#      developer identity when interactive; falls back to git config)
#   4. Runs a single conduit command to trigger bootstrap — which writes
#      ~/.claude/bin/conduit shim and updates ~/.claude/CLAUDE.md
#   5. Registers this checkout as the central conduit repo
#      (conduit init --global) so commands resolve from any repo
#   6. Optionally installs approved skills + rules from a remote registry
#      (only when a registry is configured — skipped otherwise)
#
# Usage:
#   ./install-conduit.sh [--dest <path>] [--in-place] [--skip-registry] [--registry-url <url>] [--registry-key <key>]
#
# Defaults:
#   --dest       $HOME/Repos/Conduit  (override with --dest or $CONDUIT_DEST)
#   --in-place   Skip clone/pull entirely; reuse the existing checkout at --dest (or $PWD if --dest omitted).
#                Useful when the repo has been moved or the user wants to re-wire the shim without network access.
#   Registry sync is skipped unless a registry URL is configured (config.yaml,
#   CONDUIT_REGISTRY_URL, or --registry-url) AND a key is available
#   (CONDUIT_REGISTRY_API_KEY or --registry-key).
#
# Repo URL: override the clone URL with $CONDUIT_REPO_URL.
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

DEFAULT_DEST="${CONDUIT_DEST:-$HOME/Repos/Conduit}"
REPO_URL="${CONDUIT_REPO_URL:-https://github.com/neil-alcorn/Conduit}"

DEST=""
DEST_EXPLICIT=0
IN_PLACE=0
SKIP_REGISTRY=0
REGISTRY_URL_ARG=""
REGISTRY_KEY_ARG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dest) DEST="$2"; DEST_EXPLICIT=1; shift 2 ;;
    --in-place) IN_PLACE=1; shift ;;
    --skip-registry) SKIP_REGISTRY=1; shift ;;
    --registry-url) REGISTRY_URL_ARG="$2"; shift 2 ;;
    --registry-key) REGISTRY_KEY_ARG="$2"; shift 2 ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# --in-place defaults DEST to $PWD (the user's current checkout) rather than the canonical path.
if [ "$IN_PLACE" -eq 1 ] && [ "$DEST_EXPLICIT" -eq 0 ]; then
  DEST="$PWD"
fi
if [ -z "$DEST" ]; then
  DEST="$DEFAULT_DEST"
fi

echo "Conduit installer"
echo "  destination: $DEST"

# ── Preflight ─────────────────────────────────────────────────────────

command -v git >/dev/null  || { echo "ERROR: git not found in PATH" >&2; exit 1; }
command -v node >/dev/null || { echo "ERROR: node not found in PATH (Node 20+ required)" >&2; exit 1; }
command -v npm >/dev/null  || { echo "ERROR: npm not found in PATH" >&2; exit 1; }

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node 20+ required (found v$NODE_MAJOR)" >&2
  exit 1
fi

# ── Clone (or update, or reuse in place) ──────────────────────────────

if [ "$IN_PLACE" -eq 1 ]; then
  if [ ! -d "$DEST/.git" ] || [ ! -f "$DEST/package.json" ]; then
    echo "ERROR: --in-place expects an existing conduit checkout at $DEST — not found (missing .git or package.json)" >&2
    echo "Run without --in-place to clone, or point --dest at a valid checkout." >&2
    exit 1
  fi
  echo "Using existing checkout in place (no clone, no pull): $DEST"
elif [ -d "$DEST/.git" ]; then
  echo "Repo already present — pulling latest"
  git -C "$DEST" pull --ff-only
else
  mkdir -p "$(dirname "$DEST")"
  echo "Cloning $REPO_URL → $DEST"
  git clone "$REPO_URL" "$DEST"
fi

# ── Build ─────────────────────────────────────────────────────────────

echo "Building CLI..."
(cd "$DEST" && npm install --silent && npm run build)

# ── Seed .conduit/config.yaml ─────────────────────────────────────────
# bash-3.2 compatible (macOS default shell) — no declare -A, no mapfile.

CONFIG_FILE="$DEST/.conduit/config.yaml"
EXAMPLE_FILE="$DEST/.conduit/config.yaml.example"
if [ ! -f "$CONFIG_FILE" ] && [ -f "$EXAMPLE_FILE" ]; then
  GIT_NAME="$(git config user.name 2>/dev/null || true)"
  GIT_EMAIL="$(git config user.email 2>/dev/null || true)"
  FALLBACK_USER="${USER:-${USERNAME:-developer}}"
  DEFAULT_NAME="${GIT_NAME:-$FALLBACK_USER}"
  DEFAULT_EMAIL="${GIT_EMAIL:-$FALLBACK_USER@example.com}"

  DEV_NAME=""
  DEV_EMAIL=""
  if [ -t 0 ]; then
    printf 'Developer name [%s]: ' "$DEFAULT_NAME";  read -r DEV_NAME
    printf 'Email [%s]: '          "$DEFAULT_EMAIL"; read -r DEV_EMAIL
  fi
  DEV_NAME="${DEV_NAME:-$DEFAULT_NAME}"
  DEV_EMAIL="${DEV_EMAIL:-$DEFAULT_EMAIL}"

  sed \
    -e "s|Your Name|$DEV_NAME|" \
    -e "s|you@example.com|$DEV_EMAIL|" \
    "$EXAMPLE_FILE" > "$CONFIG_FILE"
  echo "Seeded $CONFIG_FILE (developer: $DEV_NAME <$DEV_EMAIL>)"
else
  echo "Config already present (or example missing) — leaving $CONFIG_FILE untouched."
fi

# ── Trigger bootstrap ─────────────────────────────────────────────────

echo "Triggering bootstrap (writes ~/.claude/bin/conduit and updates ~/.claude/CLAUDE.md)..."
node "$DEST/dist/cli/src/index.js" --version

# ── Register central conduit path (PORT-1) ────────────────────────────
# Writes `central` into ~/.conduit/config.json so conduit commands resolve
# this checkout from ANY repo. --force re-points an existing entry (moved
# checkout / re-install).

echo "Registering central conduit path (~/.conduit/config.json)..."
node "$DEST/dist/cli/src/index.js" init --global "$DEST" --force

# ── Verify shim ───────────────────────────────────────────────────────

if [ ! -x "$HOME/.claude/bin/conduit" ] && [ ! -f "$HOME/.claude/bin/conduit" ]; then
  echo "WARNING: expected shim at ~/.claude/bin/conduit was not created — manual inspection needed" >&2
else
  echo "Shim ready: ~/.claude/bin/conduit"
  "$HOME/.claude/bin/conduit" --version
fi

# ── Optional: install skills + rules from the registry ────────────────
# Fully optional. Requires BOTH a registry URL and an API key to be
# configured. If either is missing, this step is skipped cleanly.

REGISTRY_CONFIGURED=0
if [ "$SKIP_REGISTRY" -eq 0 ]; then
  if [ -n "$REGISTRY_KEY_ARG" ]; then export CONDUIT_REGISTRY_API_KEY="$REGISTRY_KEY_ARG"; fi
  if [ -n "$REGISTRY_URL_ARG" ]; then export CONDUIT_REGISTRY_URL="$REGISTRY_URL_ARG"; fi

  # Resolve registry URL: explicit env/arg wins, else read from config.yaml.
  REGISTRY_URL="${CONDUIT_REGISTRY_URL:-}"
  if [ -z "$REGISTRY_URL" ] && [ -f "$CONFIG_FILE" ]; then
    PARSED_URL="$(grep -E '^\s*api_url\s*:' "$CONFIG_FILE" | head -1 | sed -e 's/^\s*api_url\s*:\s*//' -e "s/[\"']//g" -e 's/[[:space:]]*$//')"
    if printf '%s' "${PARSED_URL:-}" | grep -qE '^https?://'; then
      REGISTRY_URL="$PARSED_URL"
    fi
  fi

  if [ -n "$REGISTRY_URL" ] && [ -n "${CONDUIT_REGISTRY_API_KEY:-}" ]; then
    export CONDUIT_REGISTRY_URL="$REGISTRY_URL"
    echo ""
    echo "Installing approved skills from the registry..."
    (cd "$DEST" && "$HOME/.claude/bin/conduit" skill install) || echo "  (skill install failed — continuing)"
    echo "Installing approved rules from the registry..."
    (cd "$DEST" && "$HOME/.claude/bin/conduit" rules install) || echo "  (rules install failed — continuing)"
    REGISTRY_CONFIGURED=1
  else
    echo "  Registry not configured (need a registry URL + CONDUIT_REGISTRY_API_KEY) — skipping skill/rule install."
    echo "  To enable: set CONDUIT_REGISTRY_URL + CONDUIT_REGISTRY_API_KEY (or add a registry section to .conduit/config.yaml) and re-run."
  fi
fi

echo ""
echo "Done."
echo ""
echo "Next steps:"
echo "  1. Open a new terminal and run: conduit doctor"
echo "     All green = your install is verified end to end."
echo "  2. Open Claude Code in any repo — Conduit is discoverable via the global CLAUDE.md block."
echo "  3. Run: conduit context"
if [ "$REGISTRY_CONFIGURED" -eq 0 ]; then
  echo "  (Optional) Configure a remote registry via CONDUIT_REGISTRY_URL + CONDUIT_REGISTRY_API_KEY to sync skills/rules."
fi
