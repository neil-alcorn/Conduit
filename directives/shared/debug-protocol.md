<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/debug-protocol.md
# description: Scientific method debugging with cross-session state persistence.
# owner:       HUMAN
# update:      Manual — approved changes only.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Applies to any bug investigation, test failure, or unexpected behavior** — and whenever `conduit debug` is invoked.
- **Follow the six steps in order:** Reproduce → Gather evidence → Hypothesize (specific, testable, ranked) → Test one variable at a time → Fix the root cause + write a regression test → Verify (failing test, full suite, original repro).
- **Persist state** to `convoys/active/<id>/sessions/debug-*.jsonl` so context resets don't lose progress; read it back when resuming.
- **Avoid:** symptom patches (try/catch around the crash), skipping reproduction, shotgun changes, and "it works now" without explaining why.

# Debug Protocol

## Purpose

Apply the scientific method to debugging. Reproduce, gather evidence,
hypothesize, test, fix, verify. Persist debug state across sessions so
that context resets do not lose investigation progress.

---

## When This Directive Applies

- Any bug investigation
- Any test failure during convoy work
- When `conduit debug` is invoked
- Any time the agent encounters unexpected behavior

---

## Step 1: Reproduce

Confirm the symptom before investigating the cause.

- Run the failing command or test. Record the exact output
- Note the environment: OS, Node version, branch, last commit SHA
- If the bug is intermittent, attempt reproduction 3 times and record results
- Save reproduction evidence as `DebugEvidence` in the debug session

**If you cannot reproduce it, say so.** Do not investigate a phantom.

---

## Step 2: Gather Evidence

Collect data before forming theories.

- Stack traces (full, not truncated)
- Relevant log output
- `git log --oneline -10` — what changed recently?
- `git bisect` if the regression window is unclear
- Read the failing code path end-to-end

Record all evidence in the debug session. Evidence collected now saves
hypothesizing later.

---

## Step 3: Hypothesize

Form hypotheses ranked by likelihood. Each hypothesis must be:

1. **Specific** — "The `parseDate` function returns null for ISO strings with timezone offsets" not "something is wrong with dates"
2. **Testable** — You can design an experiment to confirm or refute it
3. **Ranked** — Most likely first, least likely last

```
Hypotheses:
  H1 (likely):   parseDate returns null for TZ offset strings → test with "2026-04-16T10:00:00+05:00"
  H2 (possible): Input is truncated before reaching parseDate → add log at function entry
  H3 (unlikely): Race condition in async caller → add timing logs
```

---

## Step 4: Test

Design a minimal experiment for the top hypothesis.

- Write a test case, add a log, or modify input to isolate the variable
- Run the experiment. Record the result
- If confirmed → proceed to Step 5
- If refuted → mark hypothesis as disproven, move to next hypothesis
- If inconclusive → refine the experiment or gather more evidence

**One variable at a time.** Do not change multiple things and re-run.

---

## Step 5: Fix

Once the root cause is confirmed:

1. Implement the fix targeting the root cause — not the symptom
2. Write a test that would have caught this bug (regression test)
3. If the fix is in a shared module, check callers for similar exposure

The regression test is not optional. A bug without a test will recur.

---

## Step 6: Verify

1. Run the specific failing test — it must pass
2. Run the full test suite — no regressions
3. Confirm the original reproduction steps no longer produce the symptom
4. Record the fix and verification in the `DebugSession`

```
Debug session complete.
  Root cause: parseDate did not handle timezone offset format
  Fix:        Added TZ offset parsing branch in parseDate (src/utils/date.ts:42)
  Test:       src/tests/date.test.ts — "parseDate handles timezone offsets"
  Regression: Full suite passes (N/N)
```

---

## State Persistence

Debug sessions are saved to the convoy's sessions directory:

```
convoys/active/[convoy-id]/sessions/debug-[timestamp].jsonl
```

Each entry in the JSONL file is a `DebugSession` event:
- `evidence` — reproduction output, logs, stack traces
- `hypotheses` — ranked list with status (untested/confirmed/refuted)
- `experiments` — what was tried and what resulted
- `resolution` — root cause, fix, test, verification

**This survives context resets.** When resuming a debug session, read the
JSONL file to restore full context without replaying the conversation.

---

## Anti-Patterns

- **Fixing symptoms not causes**: Wrapping a `try/catch` around the crash site instead of fixing why it crashes
- **Skipping reproduction**: "I think I know what's wrong" → change code → "it works now" → it does not work
- **Untested hypotheses**: Jumping to H3 without disproving H1 and H2
- **"It works now" without understanding why**: If you cannot explain the root cause, you have not debugged — you have gotten lucky
- **Losing debug state**: Investigating for 20 minutes, context resets, starting from scratch. Persist the session
- **Shotgun debugging**: Changing multiple things at once and hoping one of them fixes it
