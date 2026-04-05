<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        security/README.md
# description: Overview of security controls for sanitization and static analysis in CONDUIT.
# owner:       HUMAN
# update:      Manual when security architecture changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Security

CONDUIT treats sanitization and human gates as structural controls.

The sanitizer must run before external content enters an agent context.

## Current Enforced Controls

- ingress sanitization for `conduit convoy new`
- `living-spec.md` precheck during `session-start.sh`
- fail-closed Repo Signal permission checks for repo-targeting CLI commands

## Key Files

- [patterns.yaml](/C:/Users/nalco/.codex/Conduit/security/sanitizer/patterns.yaml)
- [sanitize.ts](/C:/Users/nalco/.codex/Conduit/security/sanitizer/sanitize.ts)
- [cli.ts](/C:/Users/nalco/.codex/Conduit/security/sanitizer/cli.ts)
- [sanitizer.go](/C:/Users/nalco/.codex/Conduit/cli/internal/sanitizer/sanitizer.go)
- [signals.go](/C:/Users/nalco/.codex/Conduit/cli/internal/signals/signals.go)

See [docs/security-model.md](/C:/Users/nalco/.codex/Conduit/docs/security-model.md) for the full security model and current gaps.
