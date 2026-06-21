<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/session-handoff.md
# description: Clean context handoff between sessions. Token budget optimization.
# owner:       HUMAN
# update:      Manual — approved changes only.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Save a handoff** at ~15–20 messages, on `conduit session save`, or at natural breaks — summary, decisions+rationale, completed/remaining, blockers, files_modified, context_notes — as YAML in `convoys/active/[id]/sessions/handoff-[timestamp].yaml`.
- **On resume:** read latest handoff + `convoy.yaml` + `living-spec.md`; never ask the human to re-explain last session.
- **Token rules:** fresh sessions over long ones, new topic = new session, read files only when needed.
- **Avoid:** replaying history, loading files "just in case," handoffs without decision rationale.

# Session Handoff

## Purpose

Enable clean context transfer between sessions so that no progress is lost
on context reset, and every session starts with exactly the context it needs —
no more, no less.

---

## When This Directive Applies

- Context window approaching capacity (~15–20 messages deep)
- When `conduit session save` is invoked
- Natural break point in work (end of a wave, end of a stage)
- Before stepping away from a convoy for an extended period

---

## What to Capture

The handoff follows the `SessionHandoff` type:

| Field | Content |
|---|---|
| **summary** | 2–3 sentences: what was accomplished this session |
| **decisions** | Key decisions made, each with rationale (not just "we decided X" — include why) |
| **completed** | List of tasks/files completed |
| **remaining** | List of tasks still open, with current state |
| **blockers** | Anything blocking progress (missing info, failing tests, pending review) |
| **files_modified** | Paths of all files created or changed this session |
| **context_notes** | Anything the next session needs to know that does not fit above (gotchas, partial findings, environment quirks) |

---

## Where to Save

```
convoys/active/[convoy-id]/sessions/handoff-[timestamp].yaml
```

Use ISO 8601 timestamp: `handoff-2026-04-16T14-30-00.yaml`

The file is YAML, not Markdown. It is machine-readable so that `conduit session resume`
can parse it.

---

## Resuming

When `conduit session resume` is invoked (or a new session starts on an active convoy):

1. Read the latest `handoff-*.yaml` from `sessions/`
2. Read `convoy.yaml` for current stage, gate state, workstreams
3. Read `living-spec.md` for requirements and acceptance criteria
4. Read `plan.md` if it exists, to understand the task graph

This gives full operational context without replaying conversation history.
Do not ask the human to re-explain what happened last session — the handoff
file is the source of truth.

---

## Token Efficiency Rules

These rules apply to all convoy sessions, not just handoff moments.

### Keep CLAUDE.md lean
CLAUDE.md is loaded every session. Move workflows that are only occasionally
needed into skills (loaded on-demand via `/skill-name`). CLAUDE.md should
contain: mode rules, CLI reference, layout, and conventions. Not tutorials.

### Batch operations
When multiple independent tasks can run simultaneously, dispatch them via your
host's parallel-agent primitive (see `parallel-dispatch.md` for host-specific
invocation and sequential fallback). One parallel batch of 4 agents costs less
context than 4 sequential request-response cycles.

### Fresh sessions over long sessions
Start a new session every 15–20 messages. Before ending:
1. Run `conduit session save` to capture handoff
2. Start fresh
3. Run `conduit session resume` to reload context

Long sessions accumulate stale context that wastes tokens and degrades
reasoning quality.

### New topic = new session
If the conversation shifts from convoy work to unrelated questions (or vice
versa), start a new session. Mixed-context sessions waste tokens loading
irrelevant history.

### Reduce output verbosity
When the output format is known and the human does not need commentary:
- "No commentary. Just the output."
- Skip preamble and explanation when re-running a familiar operation
- Use structured output (YAML, tables) over prose where possible

### Crop context
Do not load files "just in case." Read files when you need them. The handoff
file tells you which files matter — start there, branch out only when required.

---

## Anti-Patterns

- **Replaying full conversation history**: The handoff file exists so you do not have to do this
- **Loading all files at session start**: Read what you need, when you need it
- **Redundant summaries**: If the handoff says what happened, do not re-summarize it in conversation
- **Handoff without decisions**: A handoff that lists files but not rationale forces the next session to re-derive decisions
- **Skipping handoff on "quick" sessions**: Context resets are unpredictable. Always save if meaningful work was done
