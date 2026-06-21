<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/verification-protocol.md
# description: Evidence before assertions. Prove it works before claiming done.
# owner:       HUMAN
# update:      Manual — approved changes only.
# schema:      none
# last_update: 2026-04-16
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Loaded before any gate request, task-complete claim, or PR description.**
- **No claim without evidence:** observable proof — command output, test results, build artifacts. "I believe it works" ≠ verification.
- **Verify in the same run** as the claim — don't cite stale output from earlier.
- **`CANNOT VERIFY` is a valid verdict** and beats hand-wavy "looks fine".
- **Quote the evidence** in the gate request body so the evaluator can audit without re-running.

# Verification Protocol

> **Authoritative reference for:** evidence requirements before gate claims.

## Purpose

No claim without evidence. Every assertion that something works must be
backed by observable proof — command output, test results, or build
artifacts. "I believe this works" is not verification.

---

## When This Directive Applies

- Before any gate request
- Before claiming a task is complete
- Before committing convoy work
- Before marking a checkpoint as passed

---

## Rule: No Claim Without Evidence

This is the foundational rule. Everything else in this directive exists to
enforce it.

| Claim | Required Evidence |
|---|---|
| "Tests pass" | Command output showing test runner results with pass count |
| "Build succeeds" | Command output showing successful build with no errors |
| "No regressions" | Full test suite output (not just the changed tests) |
| "Acceptance criteria met" | Each criterion checked against specific evidence |
| "Bug is fixed" | Reproduction steps no longer produce the symptom + regression test passes |
| "Security check passes" | Sanitizer output showing clean scan |

If you cannot produce the evidence, the claim is not verified. Say "not yet
verified" instead of "done."

---

## Verification Checklist

Run through this checklist before any gate request or completion claim:

### 1. Tests pass
```bash
cd [repo] && npm test
```
Show the output. Include pass/fail counts. If any test fails, the task is
not complete — full stop.

### 2. Build succeeds
```bash
cd [repo] && npm run build
```
Show the output. A build with warnings is acceptable (note them). A build
with errors is not.

### 3. No regressions
If the change touches shared modules, utilities, or types used across the
codebase, run the full test suite — not just the tests for the changed files.

### 4. Acceptance criteria met
For each acceptance criterion in the `living-spec.md` or `ACCEPTANCE.md`:
- State the criterion
- State the evidence that satisfies it
- If the criterion cannot be verified automatically, describe the manual
  verification performed

### 5. Sanitizer passes
All agent-generated content passes through `security/sanitizer/`:
- No injection patterns in generated code
- No secrets or credentials in committed files
- No unsafe patterns flagged

---

## Property-Based Verification

When acceptance criteria are formal and precise, go beyond happy-path testing:

1. Identify the input domain (what types/ranges of input does this accept?)
2. Generate edge cases derived from the spec:
   - Boundary values (empty string, zero, max int, single element, full capacity)
   - Invalid inputs (wrong type, null, undefined, malformed)
   - Concurrent/ordering variations (if applicable)
3. Write test cases for the edge cases that matter most
4. Run them and record results

This is not exhaustive fuzzing — it is spec-informed edge case testing. The
spec tells you where the boundaries are. Test them.

---

## Output

Verification evidence is appended to the convoy checkpoint JSONL:

```
convoys/active/[convoy-id]/audit/events.jsonl
```

Each verification entry includes:
- Timestamp
- Task or gate being verified
- Checklist results (pass/fail per item)
- Command outputs (or references to them)
- Verdict: VERIFIED or NOT VERIFIED

---

## Anti-Patterns

- **Claiming done without running tests**: The most common failure. Run them. Every time
- **"I believe this works"**: Belief is not evidence. Run the command
- **Assuming completion**: "The implementation follows the pattern, so it should work" — verify, do not assume
- **Partial verification**: Running only the new tests, not checking for regressions
- **Weakening tests to pass verification**: If the test is failing, the code is wrong — not the test (unless the test itself has a bug, which must be proven)
- **Screenshots of IDE instead of command output**: IDE indicators can be stale. Run the command fresh
