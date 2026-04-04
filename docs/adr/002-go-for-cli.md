<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/adr/002-go-for-cli.md
# description: ADR for using Go for the conduit CLI.
# owner:       HUMAN
# update:      Amend only when the decision changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# ADR-002: Go for the CONDUIT CLI

Date: 2026-04
Status: Accepted

## Context

The conduit CLI must run across Windows, macOS, and Linux without stack-specific runtime dependencies.

## Decision

Use Go for the CLI binary and TypeScript for scripts and integration code.

## Rationale

- Single distributable binary
- Proven structural pattern from the approved Gastown reference
- Clear separation between CLI transport and business logic helpers
