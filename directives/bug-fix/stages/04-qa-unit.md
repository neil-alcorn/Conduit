<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/bug-fix/stages/04-qa-unit.md
# description: Stage 4 QA Unit directive delta for bug-fix convoys.
# owner:       HUMAN
# update:      Manual when QA policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 4. The regression test is the primary artifact:** it must fail without the fix, pass with the fix, and be named for the bug behavior (not `test-fix-123`).
- **Document it in the QA checkpoint** (file, test name, failure mode, fails-without-fix / passes-with-fix confirmations).
- Gate 4 requires the regression test identified, confirmed to fail without the fix, and in the permanent suite (not skipped or commented out).

# Stage 4 — QA Unit Directive (Bug Fix)

> **Delta from net-new**: See `directives/net-new/stages/04-qa-unit.md` for the full base directive.
> This file documents only what DIFFERS for bug-fix convoys.

## Recommended Model
**claude-sonnet-4-6** — Same as net-new.

## Key Difference: Regression Test Is the Primary Artifact

For bug-fix QA, the most important artifact is the **regression test**: the test that proves the bug is fixed AND would have caught this bug if it had existed before the bug was introduced.

The regression test must:
1. **Fail without the fix** — confirm by reverting the fix temporarily if not already documented at Stage 3
2. **Pass with the fix** — confirm the fix resolves the exact failure mode
3. **Be named to describe the bug** — not `test-fix-123` but `should not return null when user has no team assigned`

Document the regression test explicitly in the QA checkpoint:

```
Regression Test:
- File: [test file path]
- Test name: [exact test name]
- Failure mode tested: [the exact behavior that was broken]
- Confirmed fails without fix: [Yes/No]
- Confirmed passes with fix: [Yes/No]
```

## Gate 4 Addition (in addition to net-new checklist)

- [ ] Regression test is identified by file and name in the QA checkpoint
- [ ] Regression test is confirmed to fail without the fix (documented at Stage 3 or verified here)
- [ ] Regression test is in the permanent test suite (not tagged skip, not commented out)
