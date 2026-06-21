<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/autonomous-execution.md
# description: Rules for multi-step autonomous work with mandatory safety checkpoints.
# owner:       HUMAN
# update:      Manual — approved changes only.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Applies during `conduit execute` / any task-graph execution** (typically Stage 3).
- **Execute wave by wave.** After each wave: run tests + build, check regressions, log to events.jsonl, verify clean git status, then call `conduit execute checkpoint` — the CLI blocks at `max_autonomous_waves` (default 1, max 5) until a human runs `resume`.
- **Record the git SHA before each wave**; on failure, self-correct max 3 attempts, then reset to the SHA and escalate with full context.
- **Never cross a gate boundary autonomously**, never weaken a failing test to pass, and run the security sanitizer on agent-generated content before commit.

# Autonomous Execution

## Purpose

Define the rules for multi-step autonomous work so that agents can execute
wave after wave of tasks without constant human intervention — while
maintaining safety checkpoints that prevent cascading failures.

---

## When This Directive Applies

- Stage 3 with `conduit execute` or autonomous mode enabled
- Any time the agent is executing a task graph from `plan.md`
- Multi-step operations where intermediate human review is impractical

---

## Wave-Based Execution

Tasks are grouped into waves by the task graph (see `spec-driven-planning.md`).

**Execution order:**
1. Execute all tasks in Wave 1 (parallel where independent — see `parallel-dispatch.md`)
2. Run checkpoint protocol
3. If checkpoint passes, execute Wave 2
4. Repeat until all waves complete or a checkpoint fails

Tasks within a wave run in parallel via your host's parallel-agent primitive
(see `parallel-dispatch.md` for host-specific invocation). Tasks across waves
run sequentially. This is not negotiable — wave ordering encodes dependency
relationships.

---

## Checkpoint Protocol

After each wave completes, before starting the next:

1. **Run tests** — `npm test` (or equivalent). All must pass
2. **Run build** — `npm run build` (or equivalent). Must succeed
3. **Check for regressions** — if scope touches shared modules, run the full suite
4. **Log to events.jsonl** — record wave number, tasks completed, test results
5. **Verify no untracked changes** — `git status` must be clean (everything committed or intentionally staged)

```
Wave [N] checkpoint:
  Tests:      PASS (N/N)
  Build:      PASS
  Regressions: NONE
  Status:     CLEAN

Proceeding to Wave [N+1].
```

**If any check fails: STOP.** Do not proceed to the next wave. Report the
failure and enter the self-correction loop.

---

## Maximum Autonomous Waves

**Default: 1 wave** without human check-in. **Maximum: 5 waves.**

After completing a wave, the AI MUST call `conduit execute checkpoint [convoy-id]`.
The CLI checks `current_wave` against `max_autonomous_waves` in the manifest:

- **Below limit**: CLI increments the wave counter and prints a continue message.
- **At limit**: CLI sets status to `checkpoint-pending` and blocks. The human must
  run `conduit execute resume [convoy-id]` to approve continuation.

This enforcement is **mechanical, not directive-based**. The AI cannot skip the
checkpoint command — the manifest tracks wave progress independently of the
conversation context.

```
conduit execute checkpoint [convoy-id]   # AI calls after each wave
conduit execute resume [convoy-id]       # Human approves continuation
```

The limit is configurable via `--max-waves N` on `conduit execute start` (max 5).
Extended autonomy beyond 1 wave should include a justification in `convoy.yaml`.

---

## Rollback Point

Before each wave starts, record the current git SHA:

```bash
git rev-parse HEAD  # → rollback point for Wave N
```

If a wave fails and self-correction is exhausted:
1. Reset to the rollback point: `git reset --hard [SHA]`
2. Report what failed and why
3. Wait for human guidance

The rollback point ensures that a failed wave never leaves the repo in a
broken state.

---

## Self-Correction Loop

When a task fails (build error, test failure, lint violation):

1. Feed the error output back into reasoning
2. Identify the root cause
3. Implement a fix
4. Re-run the failing check

**Maximum 3 self-correction attempts per task.** After 3 attempts:
- STOP the task
- Log the failure and all 3 attempts to events.jsonl
- Escalate to human with full context (error, attempts, hypotheses)

Do not loop indefinitely. Three strikes and escalate.

---

## Gate Boundaries

Autonomous execution STOPS at gate boundaries. Period.

When the task graph crosses a stage boundary (e.g., last task of Stage 3),
the agent must:
1. Complete the current wave
2. Run the checkpoint protocol
3. Surface the gate requirement (see `convoy-agent-behavior.md`)
4. Wait for human decision

Never cross a gate autonomously. Gates exist precisely to interrupt
autonomous flow.

---

## Sanitizer Check

All agent-generated content must pass through the security sanitizer
(`security/sanitizer/`) before commit. This includes:
- Generated code
- Generated configuration
- Generated documentation with user-supplied content

If the sanitizer flags content, STOP and report. Do not commit flagged
content and move on.

---

## Anti-Patterns

- **Runaway execution**: Ignoring the wave limit because "it's almost done"
- **Silent failures**: A test fails, the agent "fixes" it by weakening the test
- **Skipping rollback points**: Starting a wave without recording the SHA
- **Crossing gates**: Advancing past a gate boundary without human approval
- **Infinite self-correction**: Looping past 3 attempts hoping the 4th works
