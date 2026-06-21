<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/net-new/stages/04-qa-unit.md
# description: Stage 4 QA Unit directive. Test execution, coverage, criteria verification.
# owner:       HUMAN
# update:      Manual when QA policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **No commit/push** — report findings; the Conduit window commits after gate approval.
- **Run all tests** (thresholds: MODERN 95%, LEGACY/INTEGRATION 98%), then map every AC to a test in the coverage matrix — UNCOVERED criteria block the gate.
- **Gaps:** untested → write the test; unimplemented → back to Stage 3. Every error condition needs an unhappy-path test.
- **End with a QA verdict** (PASS / CONDITIONAL PASS / FAIL); FAIL returns to Stage 3. Avoid tests that cannot fail and counting skipped tests.

# Stage 4 — QA Unit Directive (Net New)

## ⛔ COMMIT AUTHORITY — You are NOT authorized to commit or push

**You are NOT authorized to run `git commit` or `git push` in any repo during this stage.**

Committing before gate approval is a convoy violation. It makes the repo's git history inconsistent with the convoy audit trail. If a gate is rejected, a pre-approval commit requires a revert and creates noise in the history.

The authority chain is:
1. You complete the work and report findings in this session.
2. The human reviews and approves or rejects the gate.
3. **The Conduit window commits and pushes after approval.** Not before.

If you find yourself typing `git commit` or `git push` in this stage, **stop**. You are not authorized. Report your findings as text and wait for the gate decision.

This applies to ALL repos you touch in this stage.

## Recommended Model
**claude-sonnet-4-6** — QA analysis requires systematic reasoning about test coverage and criterion mapping. Haiku will miss coverage gaps. Opus is unnecessary for unit-level QA (reserve Opus for Stage 5 security analysis).

## What This Stage Produces
1. Test execution report — pass/fail status for every test
2. Criterion coverage matrix — each acceptance criterion mapped to its test cases
3. Coverage gaps identified and resolved or flagged
4. QA verdict: PASS / CONDITIONAL PASS (document conditions) / FAIL

## Context to Load
- `living-spec.md` — Acceptance Criteria section only
- `ACCEPTANCE.md` — full
- Stage 3 implementation code — the specific files changed in this Work Stream

Do NOT load full CONTEXT.md — it is not needed for unit-level QA.

## Step-by-Step Instructions

### Step 1 — Run all tests and capture results
```bash
npm run test
```
Record: total tests, passing, failing, skipped. If any test fails, do not proceed to the criterion matrix — fix failing tests first.

QA pass threshold by system class (from `qa/thresholds.yaml`):
- MODERN: 95% pass rate minimum
- LEGACY: 98% pass rate minimum
- INTEGRATION: 98% pass rate minimum

### Step 2 — Build the criterion coverage matrix
For each acceptance criterion in living-spec.md:

| Criterion | Test File | Test Name | Status |
|---|---|---|---|
| Given X, when Y, then Z | tasks.test.ts | `should return Z when Y` | PASS |
| Given X, when invalid input, then error | tasks.test.ts | `should reject invalid input` | PASS |

Flag any criterion with no corresponding test as **UNCOVERED**. Uncovered criteria are a gate blocker.

### Step 3 — Identify and fill coverage gaps
For each UNCOVERED criterion:
1. Determine if the behavior is implemented but untested (write the test)
2. Determine if the behavior is not implemented at all (flag as implementation gap — send back to Stage 3)

Do not write tests that test nothing. Each test must make at least one assertion that could fail.

### Step 4 — Test the unhappy paths explicitly
Confirm at least one test exists for each:
- Invalid input (type mismatch, missing required field)
- Unauthorized access attempt
- Empty or null responses from external dependencies

If any unhappy path is untested, write the test.

### Step 5 — Write the QA verdict
At the end of the QA checkpoint, produce:

```
QA VERDICT: [PASS | CONDITIONAL PASS | FAIL]

Tests run: N | Passing: N | Failing: N
Criteria covered: N/N

Issues found:
- [Issue description] — Severity: BLOCKER | MAJOR | MINOR

Conditions for CONDITIONAL PASS (if applicable):
- [What must be resolved before Stage 5]
```

A FAIL verdict sends the Convoy back to Stage 3.

## Gate 4 Criteria (Pre-Gate Checklist)
Before requesting Gate 4 approval, verify ALL of the following:

- [ ] All tests pass at or above system-class threshold
- [ ] Every acceptance criterion is covered by at least one test
- [ ] At least one unhappy path test exists per error condition
- [ ] No UNCOVERED criteria remain
- [ ] QA verdict is written and attached to gate request
- [ ] No tests commented out or skipped without documented justification

## Common Failure Modes
- **Criterion coverage gaps**: Tests for happy path only, error states untested.
- **Tests that cannot fail**: `expect(true).toBe(true)` style assertions.
- **Skipped tests counted as passing**: Skipped tests do not count toward coverage.
- **Testing implementation instead of behavior**: Tests that break on refactor but behavior is unchanged.

## What to Escalate
- Implementation gap found (criterion with no implementation) → send back to Stage 3 immediately
- Systemic test failures suggesting design flaw → escalate to `architect` before returning to Stage 3
- Coverage gaps that require database → escalate to QA lead for integration test plan
