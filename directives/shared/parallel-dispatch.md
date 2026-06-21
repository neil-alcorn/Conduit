<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/parallel-dispatch.md
# description: Rules for safely launching parallel agents in convoy work.
# owner:       HUMAN
# update:      Manual — approved changes only.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Applies whenever 2+ independent operations could run simultaneously** (waves, multi-repo work, research sweeps).
- **Run the independence test first**: parallel only if tasks touch different files and share no mutable resource or dependency. When in doubt, serialize.
- **Dispatch with explicit scope** — exact files, acceptance criteria, convoy context. Max 4 concurrent agents; batch beyond that.
- **Use worktree isolation** for risky/discardable work or possible file overlap; sequential fallback is correct, just slower.
- **After completion:** review every diff, resolve conflicts manually, run tests post-merge. Never fire-and-forget.

# Parallel Dispatch

## Purpose

Define when and how to launch parallel agents safely within convoy work.
Parallelism accelerates delivery but introduces coordination risk. These
rules ensure the acceleration does not come at the cost of correctness.

---

## When This Directive Applies

- Any time 2+ independent operations can run simultaneously
- Wave execution with multiple independent tasks (see `autonomous-execution.md`)
- Multi-repo convoy work across workstreams
- Research/scanning tasks across unrelated file sets

---

## Independence Test

Before dispatching tasks in parallel, confirm they are independent:

| Condition | Parallel Safe? |
|---|---|
| Tasks modify different files | YES |
| Tasks modify the same file | NO — serialize them |
| Tasks read the same files but write to different files | YES |
| Tasks share a mutable resource (DB, config, shared state) | NO — serialize or isolate |
| Tasks are in different repos | YES (usually) |
| Tasks have a dependency relationship | NO — respect wave ordering |

**When in doubt, serialize.** The cost of a conflict resolution is higher
than the cost of sequential execution.

---

## Dispatch Pattern

Use your host's parallel-agent primitive. The exact invocation depends on the agent host:

- **Claude Code:** multiple `Agent` tool calls in a single message.
- **OpenAI Codex CLI:** concurrent child agent tasks (see Codex CLI docs for the host-specific syntax).
- **Sequential fallback** (any host that lacks parallel agent dispatch): execute the tasks in order and document in the next gate request that parallel execution was unavailable. Sequential execution is correct, just slower.

Each parallel agent receives:

1. **Clear scope** — exactly which files to read/modify and what to accomplish
2. **Target files** — explicit file paths, not "find the relevant files"
3. **Acceptance criteria** — how to know the task is done
4. **Convoy context** — convoy-id, stage, any constraints from the living-spec

```
Agent 1: Implement GateFormat type in src/internal/types.ts
  - Add GateFormat union type
  - Export from index.ts
  - Acceptance: build passes with new type

Agent 2: Add JSON output tests in src/tests/gate.test.ts
  - Add test cases for --format json flag
  - Use existing test patterns in the file
  - Acceptance: tests compile (they will fail until Agent 1's work is integrated)

Agent 3: Update CLI help text in src/commands/gate.ts
  - Add --format flag to help output
  - Acceptance: conduit gate --help shows new flag
```

---

## Isolation Options

### Same worktree
Use when agents operate on non-overlapping file sets within the same repo.
This is the default and requires no special setup.

**Requirements:**
- No two agents write to the same file
- All agents work on the same branch
- Changes are committed after all agents complete (not during)

### Git worktree isolation
Use your host's git-worktree-isolation primitive (Claude Code: `Agent` tool with `isolation: "worktree"`; OpenAI Codex CLI: child agent task in an isolated worktree per Codex CLI docs). Use when changes are risky, experimental, or when file overlap cannot be ruled out.

**When to use worktrees:**
- Agents might modify overlapping files
- Changes may be discarded (spike work, experimental approaches)
- Working across branches simultaneously
- Any case where a failed agent should not affect the main worktree

Worktrees are automatically cleaned up if no changes are made.

---

## Merge Protocol

When parallel agents complete:

1. **Review all changes** before committing. Read the diffs from each agent
2. **Check for conflicts** — even with non-overlapping files, semantic conflicts
   can exist (e.g., two agents add the same import)
3. **If conflicts exist**, resolve manually. Never auto-merge conflicting changes
4. **Run tests after merge** — parallel agents each verified their own work,
   but integration may surface issues
5. **Commit as a single logical unit** when changes are related, or as separate
   commits when they are truly independent

---

## Maximum Parallel Agents

**Default: 4 concurrent agents.**

More than 4 creates diminishing returns:
- Context overhead per agent increases total token usage
- Conflict probability increases non-linearly
- Review burden after completion grows with agent count

If a wave has more than 4 independent tasks, batch them into groups of 4 and
run the batches sequentially.

This limit is adjustable per convoy in `convoy.yaml` under
`execution.max_parallel_agents`.

---

## Anti-Patterns

- **Parallel agents writing to the same file**: Guaranteed conflict. Serialize or use worktrees
- **No isolation for risky changes**: If an agent's work might be discarded, use a worktree
- **Fire-and-forget**: Dispatching agents and committing results without reviewing the combined output
- **Exceeding agent limit**: Diminishing returns turn into negative returns past 4–5 agents
- **Vague dispatch**: "Figure out what needs to change" is not a parallel task. Scope must be explicit before dispatch
- **Skipping integration test**: Each agent's work passes individually, but the combination fails. Always test after merge
