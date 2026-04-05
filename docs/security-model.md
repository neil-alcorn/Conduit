<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/security-model.md
# description: Searchable security model for CONDUIT ingress, permissions, and gate controls.
# owner:       BOTH
# update:      Update when security controls or threat assumptions change.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Security Model

## Security Intent

CONDUIT is designed to be secure first and fast second.

Core assumptions:

- external content is hostile by default
- agents should not have free rein
- human Gates are not optional
- policy must become runtime enforcement where possible

## Current Controls

### Ingress Sanitization

- The rule library lives in [patterns.yaml](/C:/Users/nalco/.codex/Conduit/security/sanitizer/patterns.yaml)
- The TypeScript evaluator lives in [sanitize.ts](/C:/Users/nalco/.codex/Conduit/security/sanitizer/sanitize.ts)
- The CLI bridge lives in [cli.ts](/C:/Users/nalco/.codex/Conduit/security/sanitizer/cli.ts)
- The Go fail-closed wrapper lives in [sanitizer.go](/C:/Users/nalco/.codex/Conduit/cli/internal/sanitizer/sanitizer.go)

Current enforced ingress points:

- `conduit convoy new`
- `agents/hooks/session-start.sh` for `living-spec.md`

If the sanitizer bridge is unavailable, ingress fails closed.

### Repo Signal Permission Enforcement

Repo Signals are parsed from `CONDUIT.md` and enforced by [signals.go](/C:/Users/nalco/.codex/Conduit/cli/internal/signals/signals.go).

Current rules:

- `QUARANTINE`: block all operations
- `OBSERVE`: allow read only
- `READ-ONLY`: block write and execute
- `ACTIVE`: permit operations, then apply system-class constraints
- `MAINFRAME`: block automated execute
- `EXTERNAL`: block write and execute

If `CONDUIT.md` is missing or malformed, the check fails closed.

### Gate Controls

- every Gate is a human approval boundary
- Gate Sync runs before evaluation
- no automatic release merge path is defined
- Release Gate now has an explicit protocol file

## What Is Not Yet Security-Complete

- sanitizer logging is line-based text, not structured JSONL
- shell hooks and Go logging are not yet unified behind one logger
- sanitizer is enforced for the current ingress paths, but not yet every future content-ingest surface
- gate and checkpoint bodies are still mostly scaffolds after permission checks
- tamper-evident audit chaining is not yet implemented

## Threat Model Keywords

Search terms:

- prompt injection
- hostile external content
- fail closed
- Repo Signals
- QUARANTINE
- READ-ONLY
- sanitizer ingress
- session-start precheck
- Gate Sync
