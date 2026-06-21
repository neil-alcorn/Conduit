<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/enhancement/stages/03-implementation.md
# description: Stage 3 Implementation directive delta for enhancement convoys.
# owner:       HUMAN
# update:      Manual when implementation policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 3.** Run the existing test suite and record a passing baseline BEFORE writing any code; if pre-existing tests fail, STOP and escalate — do not proceed.
- **Sequence:** baseline → read current implementation → write failing tests for new behavior → implement until old + new tests pass.
- Gate 3 requires: baseline documented, post-implementation test count ≥ baseline (no silent deletions), all baseline tests still passing.

# Stage 3 — Implementation Directive (Enhancement)

> **Delta from net-new**: See `directives/net-new/stages/03-implementation.md` for the full base directive.
> This file documents only what DIFFERS for enhancement convoys.

## Recommended Model
**claude-sonnet-4-6** standard / **claude-opus-4-6** for security-sensitive code — same as net-new.

## Key Difference: Run Existing Tests First

Before writing a single line of new code, run the existing test suite and confirm it passes:

```bash
npm run test
```

Record: total tests, passing, failing. This is your **baseline**.

If any existing tests fail before you have written a line of code: **STOP**. Do not proceed. Document the pre-existing failures and escalate to the QA lead. You cannot distinguish regressions you introduced from pre-existing failures if you do not establish baseline first.

Only after a passing baseline may you begin writing new code.

## Sequence for Enhancement Implementation

1. **Run existing tests → confirm baseline passes**
2. Read CONTEXT.md and the current implementation of the component being extended
3. Write new tests for the new/changed behavior (they will fail initially — that is correct)
4. Implement the enhancement until both old and new tests pass
5. Confirm baseline test count did not decrease (no tests were silently deleted)

This sequence is the enhancement equivalent of net-new's schema-first rule. Skipping step 1 is the most common source of untraceable regressions.

## Gate 3 Addition (in addition to net-new checklist)

- [ ] Baseline test run documented (test count and pass rate before changes)
- [ ] Post-implementation test count is ≥ baseline count (no tests removed)
- [ ] All baseline tests still pass (no regressions introduced)
