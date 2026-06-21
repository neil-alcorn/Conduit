<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/spec-driven-planning.md
# description: Structured spec creation before implementation. Requirements → Impact Map → Task Graph.
# owner:       HUMAN
# update:      Manual — approved changes only.
# schema:      none
# last_update: 2026-05-22
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- Run at Stage 0–2 or whenever transitioning from intent to implementation
- Resolve unresolved approach decisions before writing requirements (Phase 0)
- Every impact map entry must reference a file you have actually read — no guessing
- STOP after producing the plan; do not write any implementation code until the human approves

# Spec-Driven Planning

## Purpose

Before writing code, create a structured spec that agents reason against
throughout implementation. The spec is the contract — not the conversation
history, not the developer's mental model. If it is not in the spec, it is
not in scope.

---

## When This Directive Applies

- Any convoy at Stage 0–2
- When `conduit plan` is invoked
- Any time work transitions from "what do we want" to "how do we build it"
- Multi-file changes, multiple valid approaches, unclear requirements, or architectural decisions

---

## Read-Only Posture During Planning

**While producing the plan (Phases 0–3), make no file writes.**

Use only Read, Glob, and Grep to explore the codebase. Bash is permitted only
for `conduit` CLI commands (e.g. `conduit plan init`). Do not create, edit, or
delete files until the human has approved the plan.

---

## Phase 0: Approach Resolution

Before writing requirements, identify any unresolved design decisions that would
force a different plan if answered differently. Surface these to the human first.

**Ask — don't assume — when:**
- There are two or more valid architectural approaches (e.g. server-side vs client-side, sync vs async)
- An existing pattern could be reused but it's unclear if the human wants consistency or divergence
- A scope boundary is ambiguous (what's in this convoy vs deferred)

**Format:**
```
Before I write the plan, I need one decision:

[Q1] [Concise framing of the choice]
  Option A: [what it means for the plan]
  Option B: [what it means for the plan]

Everything else I can derive from the living-spec and the codebase.
```

Only ask questions that genuinely change the plan. Once answered, proceed to Phase 1 without further check-ins.

---

## Phase 1: Requirements Capture

Transform natural language intent into structured requirements using EARS
(Easy Approach to Requirements Syntax) notation.

**EARS patterns:**

| Type | Template |
|---|---|
| Ubiquitous | The system shall [action] |
| Event-driven | When [event], the system shall [action] |
| State-driven | While [state], the system shall [action] |
| Unwanted behavior | If [condition], then the system shall [action] |
| Optional | Where [feature is enabled], the system shall [action] |

Each requirement MUST have:
- A unique ID (e.g., `REQ-001`)
- One or more acceptance criteria (testable, binary pass/fail)
- A priority (must / should / could)

**Output:** Requirements section in `living-spec.md`.

---

## Phase 2: Repository Impact Map

Before planning tasks, scan the actual codebase. This is the most commonly
skipped step and the most expensive to skip.

**Protocol:**

1. Use `Grep` to find existing patterns related to the feature
2. Use `Read` to examine the files you will change
3. Use `Glob` to understand directory structure and naming conventions

**Impact Map structure:**

```markdown
## Impact Map

### [repo-name]
| File | Change | Reason |
|---|---|---|
| src/commands/gate.ts | Add `--format` flag | REQ-003 requires JSON output |
| src/internal/types.ts | Add GateFormat type | Type support for new flag |
| src/tests/gate.test.ts | Add 2 test cases | Cover JSON output path |
```

Every row must reference:
- A real file path (confirmed via Glob/Read — not guessed)
- A real function or export name if modifying existing code
- The requirement it serves

**If you cannot confirm a file exists, do not include it in the impact map.**
Create a "New Files" section instead, with the proposed path and justification.

---

## Phase 3: Task Graph

Decompose the impact map into PlanTask objects:

```yaml
tasks:
  - id: task-001
    title: "Add GateFormat type to internal types"
    depends_on: []
    wave: 1
    files: [src/internal/types.ts]
    acceptance: "GateFormat type exported, build passes"
    operations: ["npm run build"]

  - id: task-002
    title: "Implement --format flag in gate command"
    depends_on: [task-001]
    wave: 2
    files: [src/commands/gate.ts]
    acceptance: "conduit gate request --format json produces valid JSON"
    operations: ["npm run build", "npm test"]
```

**Wave assignment rules:**
- Tasks with no dependencies → Wave 1
- Tasks depending only on Wave 1 → Wave 2
- Continue until all tasks assigned
- Tasks within the same wave can run in parallel (see `parallel-dispatch.md`)

---

## Human Review Checkpoint

**MANDATORY.** After producing the plan, STOP and present it for human review.
Do not ask "Is this okay?" — present the summary and wait for explicit confirmation.

```
Planning is complete.

Impact Map:  [N] files across [N] repos
Task Graph:  [N] tasks in [N] waves
Operations:  [list distinct shell commands the plan will run]
Estimated scope: [brief size assessment]

Please review the plan before I begin implementation.
Catching errors in a 3-line impact map costs far less than in a PR.
```

Do not begin implementation until the human confirms. This is not a gate in
the formal Conduit sense — it is a planning checkpoint. But it is mandatory.

---

## Output

The plan is saved as `plan.md` in the convoy directory, following the
`PlanSpec` type from conduit-core. It includes:
- Requirements (EARS notation with acceptance criteria)
- Impact Map (real files, real paths)
- Task Graph (waves, dependencies, acceptance per task)

---

## Anti-Patterns

- **Vague-in-vague-out**: Fuzzy requirements produce fuzzy implementations. If the requirement cannot be tested, rewrite it until it can
- **Planning without reading code**: Every impact map entry must reference a file you have actually read. No exceptions
- **Guessing file paths**: Use Glob to confirm. Wrong paths cascade into wrong plans
- **Skipping the impact map**: Going straight from requirements to tasks misses integration points, existing patterns, and naming conventions
- **Planning in conversation only**: If the plan is not written to `plan.md`, it does not survive a session handoff
- **Writing files before plan is approved**: No creates, edits, or deletes until the human confirms. Discovery tools only during Phases 0–3
- **Mixing approach questions with approval**: Unresolved design decisions belong in Phase 0, not in the review checkpoint summary
