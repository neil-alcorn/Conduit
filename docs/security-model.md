<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/security-model.md
# description: Searchable security model for CONDUIT ingress, permissions, and gate controls.
# owner:       BOTH
# update:      Update when security controls or threat assumptions change.
# schema:      none
# last_update: 2026-04-18
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

- The rule library lives in `security/sanitizer/patterns.yaml`
- The TypeScript evaluator lives in `security/sanitizer/sanitize.ts`
- The CLI bridge lives in `security/sanitizer/cli.ts`

Current enforced ingress points:

- `conduit convoy new`
- `agents/hooks/session-start.sh` for `living-spec.md`
- `conduit skill create` (skill name and content sanitized)

If the sanitizer bridge is unavailable, ingress fails closed.

### Repo Signal Permission Enforcement

Repo Signals are parsed from `CONDUIT.md` and enforced by the CLI permission checks in `cli/src/internal/signals.ts`.

Current rules:

- `QUARANTINE`: block all operations
- `OBSERVE`: allow read only
- `READ-ONLY`: block write and execute
- `ACTIVE`: permit operations, then apply system-class constraints and content signals
- `MAINFRAME`: block automated execute
- `EXTERNAL`: block write and execute

If `CONDUIT.md` is missing or malformed, the check fails closed.

### Content Signals Enforcement

The `content_signals` block in CONDUIT.md Repo Signals declares per-repo agent interaction boundaries. Inspired by Cloudflare's content negotiation signals pattern.

Three fields, each accepting `yes`, `no`, or `scoped`:

| Signal | Effect of `no` | Effect of `scoped` |
|--------|----------------|---------------------|
| `ai_input` | Blocks agent read operations on the repo | Agents may read only designated files |
| `ai_modify` | Blocks agent write operations | Only agent-managed files may be modified |
| `ai_train` | Content must not be used for external model training | N/A — informational |

Enforcement:

- `checkContentSignals()` in `cli/src/internal/signals.ts` — called during `checkPermission()` for ACTIVE repos
- Validated by `conduit validate highway` (checks that values are `yes`, `no`, or `scoped`)
- Surfaced in `conduit context` repo signals output (shows `ai_input`, `ai_modify`, `ai_train` per repo)

When `content_signals` is absent from a repo's signals block, no content constraints are applied (permissive default).

### Token-Aware Context Budgeting

`conduit context` shows per-file token estimates and total budget, helping agents manage context window pressure and decide what to load fully vs. summarize.

`conduit gate request` embeds token metadata in assembled gate context so evaluators know the cost of each section.

Utility: `cli/src/internal/tokens.ts`

- `estimateTokens(text)` — ~4 characters per token heuristic
- `formatTokens(count)` — human-readable display (`~1.2k tokens`)
- `estimateFileTokens(filePath)` — file-level estimation

### Skill Security

Skills are validated before distribution:

- `conduit skill validate` checks structure, required sections, and security notes
- `conduit skill request-review` submits a skill for reviewer approval in the optional registry
- Sanitizer runs on skill name and content during `conduit skill create`
- `behaviors.yaml`: `skills.require_approval: true` by default — shared skills need approval before distribution

### Gate Controls

- every Gate is a human approval boundary
- Gate Sync runs before evaluation
- no automatic release merge path is defined
- Release Gate now has an explicit protocol file

## What Is Not Yet Security-Complete

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
- content signals
- ai_input
- ai_modify
- ai_train
- skill approval
- token budgeting
