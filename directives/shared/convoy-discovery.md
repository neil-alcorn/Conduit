<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/convoy-discovery.md
# description: How to discover and load convoy artifacts at session start.
# owner:       HUMAN
# update:      Manual — approved changes only.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Use at session start to locate convoy state.** Convoy artifacts live in the conduit repo under `convoys/active/<id>/` — never in the target repo.
- **Sequence:** find the conduit repo (shim `~/.claude/bin/conduit`) → list `convoys/active/` → read `convoy.yaml` (stage, work_type, workstreams, work_items) → load the matching stage directive → living-spec, ACCEPTANCE.md, gate-log, latest handoff → target repo CONDUIT.md/CONTEXT.md/CLAUDE.md.
- **`conduit status` is CWD-sensitive** and can misreport with multiple active convoys — verify `convoys/active/` directly; ask the user if ambiguous.
- **Load only stage-specific + shared directives** — token budget matters.

# Convoy Discovery & Bootstrap

## Purpose

When an AI agent starts a new session and needs to find an active convoy, the
artifacts are not always where you expect. This directive defines the discovery
sequence so that every session — fresh or resumed — can find and load convoy
state reliably.

---

## The Key Rule: Convoys Live in the Conduit Repo

Convoy artifacts (YAML, living-spec, acceptance criteria, gate logs, events)
live in the **conduit repo**, not in the target repo.

```
conduit/convoys/active/<convoy-id>/
  convoy.yaml                          # Metadata: stage, status, workstreams, work items
  living-spec.md                       # Full technical specification
  events.jsonl                         # Event history (stage transitions, gate passes)
  workstreams/<ws-id>/ACCEPTANCE.md    # Acceptance criteria per workstream
  audit/
    gate-log.jsonl                     # Gate audit trail
    gate-context-N.md                  # Gate evaluation reports
  sessions/
    handoff-<timestamp>.yaml           # Session handoff files
  brief.md                             # (optional) Quick state summary
  plan.md                              # (optional) Task graph for execution
```

The target repo contains `CONDUIT.md` and `CONTEXT.md` — these
describe the repo's rules and architecture. They do NOT contain convoy state.

---

## Discovery Sequence

When starting a new session and asked to work on a convoy:

### Step 1 — Find the conduit repo

The Conduit CLI and all convoy state live in the conduit repo (exact path
varies by machine). The CLI itself is invoked via the shim:
`~/.claude/bin/conduit`. Use that shim rather than hardcoding absolute paths in
new work; to discover the repo root from the shim, run
`~/.claude/bin/conduit doctor` or inspect `$CONDUIT_NODE_ENTRY`.

### Step 2 — Check for active convoys

```bash
# Option A: Use the CLI (run from any repo; convoys live in the conduit repo)
~/.claude/bin/conduit status

# Option B: List the directory directly
ls "$(dirname "$(dirname "$(dirname "$CONDUIT_NODE_ENTRY")")")/convoys/active/"
```

`conduit status` may report the wrong convoy if multiple are active. Always
verify by checking `convoys/active/` directly.

### Step 3 — Load convoy.yaml

Read `convoys/active/<convoy-id>/convoy.yaml` to understand:
- `stage` — current stage number
- `status` — active / paused / completed
- `work_type` — net-new / enhancement / bug-fix (determines which directives apply)
- `workstreams` — which repos are involved
- `work_items` — linked tracker work items and gate transition rules

### Step 4 — Load the stage directive

Based on `work_type` and `stage`, load the appropriate directive:
```
conduit/directives/<work_type>/stages/<NN>-<stage-name>.md
```

Stage name mapping:
| Stage | Name |
|-------|------|
| 0 | intake |
| 1 | ba-requirements |
| 2 | solution-design |
| 3 | implementation |
| 4 | qa-unit |
| 5 | qa-security |
| 6 | qa-regression |
| 7 | bp-comms |
| 8 | release |

### Step 5 — Load convoy artifacts

In order:
1. `living-spec.md` — full specification
2. `workstreams/<ws-id>/ACCEPTANCE.md` — acceptance criteria (primary checklist)
3. `audit/gate-log.jsonl` — which gates have passed
4. `sessions/handoff-*.yaml` — latest session handoff (if resuming)

### Step 6 — Load target repo context

Read from the target repo (identified in workstreams[].repo_slug):
1. `CONDUIT.md` — repo rules and permissions
2. `CONTEXT.md` — architecture and conventions
3. `CLAUDE.md` — AI assistant instructions

### Step 7 — Load shared directives

Always load:
- `directives/shared/convoy-agent-behavior.md` — agent behavior rules
- `directives/shared/gate-evaluator.md` — gate evaluation protocol

Load as needed based on stage:
- Stage 3: `autonomous-execution.md`, `tdd-protocol.md`
- Stage 4-6: `verification-protocol.md`
- Session end: `session-handoff.md`

---

## Why `conduit status` From the Target Repo May Show Nothing

`conduit status` looks for `convoys/` relative to the current working directory.
If you run it from the target repo, it won't find convoys because
they live in the conduit repo. This is by design — convoys are a Conduit concern,
not a repo concern.

**Pattern:** Always run `conduit status` from the conduit repo, or check
`conduit/convoys/active/` directly.

---

## Multiple Active Convoys

When `convoys/active/` contains multiple convoy directories:

1. If the user named a specific convoy → use that one
2. If the user named a target repo → match via `workstreams[].repo_slug`
3. If ambiguous → list all active convoys with stage and status, ask the user

---

## Convoy Lifecycle Directories

| Directory | Contains |
|-----------|----------|
| `convoys/active/` | In-progress convoys |
| `convoys/archive/` | Completed convoys (post Gate 8) |
| `convoys/pending/` | Planned but not yet started |

---

## Anti-Patterns

- **Searching the target repo for convoy artifacts**: They are not there
- **Running `conduit status` from the wrong directory**: Always run from conduit repo
- **Assuming no convoy exists because CLI shows nothing**: Check `convoys/active/` directly
- **Loading all directives at once**: Load stage-specific + shared only. Token budget matters
- **Skipping CONDUIT.md / CONTEXT.md in the target repo**: These contain critical rules
