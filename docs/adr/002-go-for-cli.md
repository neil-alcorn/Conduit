<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/adr/002-go-for-cli.md
# description: ADR for using Go for the conduit CLI — superseded by TypeScript decision.
# owner:       HUMAN
# update:      Amend only when the decision changes.
# schema:      none
# last_update: 2026-04-09
# ─────────────────────────────────────────────────────────────────────
-->

# ADR-002: Go for the CONDUIT CLI

Date: 2026-04
Status: Superseded

> **Superseded 2026-04-09:** The CLI was not built in Go. The implemented CLI is TypeScript/Node.js (`cli/src/index.ts`, compiled to `dist/cli/src/index.js`). No Go toolchain is required. The original rationale below is retained for historical context.

## Context

The conduit CLI must run across Windows, macOS, and Linux without stack-specific runtime dependencies.

## Original Decision (Superseded)

Use Go for the CLI binary and TypeScript for scripts and integration code.

## Actual Decision

Use TypeScript/Node.js for the entire CLI. The CLI entry point is `cli/src/index.ts`, compiled via `tsc` and run with `node dist/cli/src/index.js`. The `package.json` `bin` field wires `conduit` to the compiled output.

## Rationale

- Single distributable binary
- Proven structural pattern from the approved Gastown reference
- Clear separation between CLI transport and business logic helpers
