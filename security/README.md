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

- `sanitizer/patterns.yaml`
- `sanitizer/sanitize.ts`
- `sanitizer/cli.ts`
- CLI permission checks: `cli/src/`

See [docs/security-model.md](../docs/security-model.md) for the full security model and current gaps.
