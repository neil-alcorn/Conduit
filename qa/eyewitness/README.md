<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        qa/eyewitness/README.md
# description: Notes on the constrained EyeWitness pattern adapted for CONDUIT visual regression.
# owner:       HUMAN
# update:      Manual when visual regression architecture changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Visual Regression & QA Automation

## Architecture

Conduit wraps Playwright as a **subprocess** — not as an MCP server or plugin. Claude never
gets direct browser access. All operations go through `conduit qa` CLI commands with:

- URL allowlist enforcement (localhost-only by default)
- JSONL audit trail for every operation
- Convoy event logging
- No arbitrary JS execution, credential access, or network interception

## Commands

```bash
conduit qa visual --url http://localhost:3000                # Screenshot capture
conduit qa visual --url http://localhost:3000 --baseline img  # Capture + compare
conduit qa e2e --tests tests/e2e/                            # Run Playwright test suite
conduit qa accessibility --url http://localhost:3000          # WCAG 2.1 AA scan (axe-core)
conduit qa status                                            # Show QA output summary
```

## Configuration

Edit `qa/eyewitness/config.yaml` to adjust:
- Browser engine and viewport size
- Output directory
- Allowed hosts (add deployed app URLs for non-localhost testing)

## Security Model

This implementation explicitly does NOT expose:
- Arbitrary JavaScript execution (`browser_run_code`)
- Cookie/localStorage/sessionStorage access
- Network request interception or mocking
- Persistent browser profiles or credential storage
- File system access beyond QA output directories

The Playwright MCP plugin was evaluated and rejected for security reasons. See
`docs/adr/` for the decision record.

## Prerequisites

```bash
npm install -D @playwright/test    # Add to conduit's devDependencies
npx playwright install chromium    # Download browser binary
```

Playwright is an optional dependency. Commands check for availability and give
instructions if missing.

## Pipeline Position

- **Stage 4 (QA Unit):** `conduit qa accessibility` — WCAG violations block gate
- **Stage 6 (QA Regression):** `conduit qa visual` — screenshot comparison against baselines
- **Stage 7 (BP Comms):** `conduit qa e2e` — full E2E test suite

## Legacy

This directory originally contained EyeWitness-adapted stubs (capture.sh, compare.sh).
Those stubs are preserved but superseded by `conduit qa` commands backed by Playwright.
