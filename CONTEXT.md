<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        CONTEXT.md
# description: Living architecture summary for the Conduit CLI.
# owner:       BOTH
# update:      Post-merge by Context Updater Agent, with owner approval.
# schema:      none
# last_update: 2026-06-12
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Living architecture summary for the Conduit CLI itself.** Read when modifying CLI internals or planning a Conduit feature.
- **Updated post-merge** by the Context Updater Agent with owner approval — don't hand-edit casually.
- **Authoritative for:** module map, key invariants, and what just shipped. If it conflicts with the code, the code wins and CONTEXT.md needs an update.

# CONTEXT: conduit

## Architecture Overview

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript strict (ES2022) | 5.8.0 |
| Runtime | Node.js 18+ (native fetch, node:test, node:readline) | — |
| Dependencies | js-yaml only (deliberately minimal) | 4.1.0 |
| Optional | Playwright (@playwright/test) for QA commands | 1.59.1 |
| Module format | CommonJS with .js extensions for ESM compat | — |
| Test runner | Node.js built-in node:test (589 tests) | — |
| Build | tsc → dist/ | — |

**Zero external orchestration** — pure Node.js determinism. No Go, no Python, no external services.

## Module or Service Map

### Commands (`cli/src/commands/`) — 18 total

| Command | File | Purpose |
|---------|------|---------|
| context | `context.ts` | Session bootstrap — prints operating picture for active convoy |
| sync | `sync.ts` | Work-tracker REST API — fetches epic + children, maps state → stage |
| init | `init.ts` | Highway Init — `--target` writes only CONDUIT.md; `--global <path>` writes config.central (CLI-4); `--enrich` prints enrichment protocol for agent layer; `--enrich --verify` validates CONTEXT.md completeness + evidence anchors, stamps freshness |
| convoy | `convoy.ts` | Lifecycle: new, close, pause, resume, remove. `convoy new` records metadata.target_repo (CLI-4) |
| gate | `gate.ts` | eval, approve, reject, request, skip. `request --auto-commit` enforces request-file + audit/** discipline (CLI-1) |
| checkpoint | `checkpoint.ts` | create, pass, fail, list — JSONL-based acceptance tracking |
| status | `status.ts` | Aggregates convoy stage, last gate, checkpoint summary |
| validate | `validate.ts` | Highway document + convoy record validation |
| plan | `plan.ts` | init, show, approve — spec-driven planning scaffold |
| execute | `execute.ts` | start, status, pause, resume — wave-based autonomous execution |
| review | `review.ts` | init, show, findings — multi-agent code review with confidence scoring |
| debug | `debug.ts` | start, hypothesize, evidence, resolve, list — cross-session state |
| session | `session.ts` | save, resume, list — context handoff across sessions |
| decompose | `decompose.ts` | generate, lint, review, approve, apply — requirements decomposition |
| skill | `skill.ts` | create, list, validate — scaffold and manage Conduit skills |
| qa | `qa.ts` | visual, e2e, accessibility, status — Playwright wrapper |
| pre-gate | `pre-gate.ts` | Universal 5 + directive-declared `**check-id**:` items dispatched via executor registry; `--accept "id:reason"` rewrites FAIL→ACCEPTED (CLI-2) |
| audit-summary | `audit-summary.ts` | Runs `npm audit --json` and renders a deduped advisory markdown table; exit-code policy 0/1/2/3 (CLI-3) |
| migrate-stray-registry | `migrate-stray-registry.ts` | One-shot operator command: relocate stray convoys from a target repo into central conduit storage (CLI-4 / AC-20) |

### Internal Modules (`cli/src/internal/`)

| Module | Purpose |
|--------|---------|
| `checkpoint.ts` | JSONL persistence, readLatest (last-wins dedup), filterByWorkstream |
| `config.ts` | Reads `.conduit/config.yaml` (developer fields, optional registry) |
| `convoy-events.ts` | ConvoyEvent types + events.jsonl append (started, passed, closed, etc.) |
| `gate-events.ts` | GateEvent types + gate-log.jsonl (requested, passed, rejected, skipped) |
| `id-generator.ts` | nextCheckpointID — reads JSONL, increments max CP-NNNNNN |
| `sanitizer.ts` | Ingress sanitization via patterns.yaml, context-flooding checks |
| `signals.ts` | RepoSignals parsing from CONDUIT.md, checkPermission (status × intent) |
| `staleness.ts` | daysSince() for CONTEXT.md age warnings (STALE_DAYS = 30); `formatReenrichmentOffer()` for stale-repo re-enrichment offers |
| `ui.ts` | ANSI terminal styling, tagged prefixes, banners, progress bars |
| `markdown-links.ts` | Pure-function `extractMarkdownLinks` + `filterAuditLinks` for gate-request commit discipline (CLI-1) |
| `npm-audit.ts` | Pure-function helpers `parseAuditJson` / `dedupAdvisories` / `renderTable` / `hasBlockingSeverity` for `audit-summary` (CLI-3) |
| `directive-checklist.ts` | Parser for `## Gate <N> Criteria (Pre-Gate Checklist)` H2 sections; extracts `**check-id**: label` items (CLI-2) |
| `diff-scope.ts` | Resolves `base_branch` from convoy.yaml; `git merge-base` orphan detection; returns changed files filtered by test globs (CLI-2) |
| `pre-gate-checks.ts` | Executor registry: build / tests / living-spec / acceptance / token-budget / lint / console-log-audit / commented-code-audit / audit-summary (CLI-2) |
| `conduit-config.ts` | Atomic read/write for `~/.conduit/config.json` (`central` + `repos` map). Cached reads, atomic temp+rename writes, CONDUIT_CONFIG_PATH override hook for tests. `autoRegisterCwdRepo()` detects git toplevel + CONDUIT.md and registers idempotently; warns + auto-updates on path mismatch (CLI-4) |
| `migrate.ts` | Pure-function helpers for `migrate-stray-registry`: scan source convoys, detect id collisions against central, build migration plan (CLI-4) |
| `headless-io.ts` | `isHeadless()` / `setHeadless()` flag, prompt suppression (returns default silently in headless mode), CONTEXT key accessor `getHeadlessContext()` (headless-mode) |
| `headless-output.ts` | `HeadlessResultPayload` shape, `headlessOutput()` / `headlessEvent()` / `headlessError()` — single JSON doc to stdout, JSON-lines to stderr; `hasEmittedOutput()` guard (headless-mode) |
| `context-parser.ts` | `parseContextBlock()` (YAML or JSON stdin), `validateContext()` against a `ContextSchema`, `loadHeadlessContext()` entry point, 1 MB stdin cap, `backfillConvoyArg()` helper (headless-mode) |

### Utilities (`cli/src/utils.ts`)

resolveRepoPath, parseFlagValue, readPrompt, yamlSafe, mdSafe, currentActor, todayISO, nextConvoyID, **resolveConvoyRoot** (central-only resolution: explicit startPath → `$CONDUIT_HOME` → `config.central` → throws ConduitNotInitializedError when neither resolves; never walks up from CWD; never auto-creates a registry; CONDUIT_LEGACY_RESOLVE=1 escape hatch for one release — CLI-4 / AC-16), **resolveTargetRepoPath(convoyId)** (resolves convoy.yaml metadata.target_repo via config.repos map for AC-19 source-code commit re-routing), **resolveTargetRepoPathOrOffer(convoyId)** (wraps resolveTargetRepoPath with clone/register instructions to stderr on failure), **ConduitNotInitializedError**

### Test Suite (`cli/src/tests/`) — 596 tests

checkpoint, checkpoint-lifecycle, convoy-events, convoy-close, convoy-id-validation, convoy-new-guard, gate, signals, staleness, plan, execute, review, debug, session, skill, conduit-config, registry-sync-drift, headless-foundation, headless-e2e, yaml-injection, events-lock, hermetic-env, skills-parity, init-enrich, init-global, learn, skills-install, shim-line-endings, command-help-drift, gate-request-commit, migrate-stray-registry, sanitizer, npm-audit, directive-checklist (and others — see `cli/src/tests/`)

## Data Flow Summary

```
CLI args → resolveRepoPath (extract --repo)
  → Command dispatch (switch)
    → checkPermission (CONDUIT.md signals: ACTIVE/READ-ONLY/OBSERVE/QUARANTINE)
    → Command handler:
        Read/write YAML (convoy.yaml, directive files)
        Append JSONL (gate-log.jsonl, events.jsonl, checkpoints.jsonl)
    → Console output (tagged prefixes, ANSI colors)
```

**Convoy lifecycle:** `convoys/active/CNV-NNNN/` contains convoy.yaml, living-spec.md, plan.md, workstreams/, audit/ (gate-log.jsonl, events.jsonl, gate-context-N.md)

**9-stage pipeline:** Intake (0) → BA Requirements (1) → Solution Design (2) → Implementation (3) → QA Unit (4) → QA Security (5) → QA Regression (6) → BP & Comms (7) → Release (8)

**No database** — JSONL append-only, last-record-wins dedup.

## Authentication and Authorization

**Work tracker:** No tracker integration is configured in this build. Use your tracker's native tooling or MCP server to sync work items.

**Optional registry:** When `.conduit/config.yaml` defines a `registry`, the skill/rules/learn commands sync approved content to it. Configured via `CONDUIT_REGISTRY_URL` / `CONDUIT_REGISTRY_API_KEY` or the `registry.{api_url, api_key}` config keys.

**Repo permissions:** CONDUIT.md `operational_status` field controls access:
- ACTIVE: read/write/execute/comms allowed
- READ-ONLY: read only
- OBSERVE: read only
- QUARANTINE: all blocked

**Config:** `.conduit/config.yaml` (per-repo) stores developer.{name, email} and an optional registry.{api_url, api_key}.

**Per-developer config (CLI-4):** `~/.conduit/config.json` records `central` (path to the conduit repo holding `convoys/registry.yaml`) and `repos` (logical-name → absolute-path map for cross-machine portability). Set via `conduit init --global <path>`. Atomic temp+rename writes; cached reads; non-fatal on missing or malformed JSON. Override location for tests via the `CONDUIT_CONFIG_PATH` env var.

## Significant Changes (Last 90 Days)

- 2026-06-18: Personal TypeScript baseline — re-based onto the TypeScript CLI; removed org-specific (work-tracker / registry / portfolio) integrations so Conduit runs as a generic, org-agnostic delivery orchestration tool. `sync` is now a placeholder (no tracker integration); the optional remote backend is a provider-neutral `registry` (env `CONDUIT_REGISTRY_URL` / `CONDUIT_REGISTRY_API_KEY`).

## Technical Debt

| Issue | Location | Impact |
|-------|----------|--------|
| CONTEXT.md scaffold all TODOs | `init.ts` | Highway Init generates skeleton; human must enrich |
| Skill templates TODO-filled | `skill.ts` | Created skills need manual completion |
| convoy list not implemented | — | Stub only; scanActiveConvoys logic exists |
| No concurrent convoy support | — | Only 1 active convoy auto-detected |
| Staleness no auto-enrich | — | Re-enrichment offer surfaced in `context` and `doctor` — purely informational; by design enrichment never auto-runs |

## Performance Characteristics

| Operation | Duration |
|-----------|----------|
| npm run build | 3-5s |
| npm test (562 tests) | ~390s |
| conduit context | ~100ms |
| conduit sync (10 children) | 500-1000ms |
| conduit gate request | ~50ms |
| conduit decompose generate | ~200ms |

**Storage:** convoy.yaml ~1KB, events.jsonl ~50KB, gate-context-N.md ~100KB. All JSONL append-only; no cleanup yet.

## Known Failure Modes

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| JSONL corrupted | readJSONL skips bad lines | Manually edit JSONL file |
| patterns.yaml malformed | Sanitizer fails closed | Fix YAML syntax |
| Two convoys same ID | Only first found returned | Use --repo flag |
| Gate criteria missing | "stage directive not found — checklist unavailable" | Provision directive file |
| Checkpoint workstream mismatch | Created anyway (no FK check) | Manual cleanup |
