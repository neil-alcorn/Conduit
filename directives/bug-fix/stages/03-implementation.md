<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/bug-fix/stages/03-implementation.md
# description: Stage 3 Implementation directive delta for bug-fix convoys.
# owner:       HUMAN
# update:      Manual when implementation policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 3. Minimum change that resolves the root cause** — no refactoring, cleanup, or "while I'm here" improvements unless the refactor IS the fix; log wants as a separate maintenance convoy.
- **Sequence:** write a failing test that reproduces the bug → implement the minimal fix → confirm the test passes → run the full suite for regressions.
- Gate 3 requires a Fix Scope Log for every changed file/function with zero `Required: No` entries, and proof the failing test predates the fix.

# Stage 3 — Implementation Directive (Bug Fix)

> **Delta from net-new**: See `directives/net-new/stages/03-implementation.md` for the full base directive.
> This file documents only what DIFFERS for bug-fix convoys.

## Recommended Model
**claude-sonnet-4-6** standard / **claude-opus-4-6** for security-sensitive code — same as net-new.

## Key Difference: The Fix Must Be Minimal and Surgical

Bug-fix implementation has a strict scope constraint that net-new does not:

**The fix must be the minimum change that resolves the root cause.** No refactoring, no cleanup, no "while I'm in here" improvements — unless the refactor IS the fix (e.g., the bug is caused by an architectural smell that cannot be resolved without restructuring).

Before writing any code, ask: **"Is this change required to fix the bug, or is it something I want to do?"** If the answer is "want to do" — stop. Log it as a separate maintenance convoy and do not include it here.

## Scope Enforcement

Keep a fix scope log in the living-spec.md Decisions section:

```
### Fix Scope Log
Change 1: [file/function] — Required: [Yes/No] — Reason: [why this change is necessary for the fix]
Change 2: [file/function] — Required: [Yes/No] — Reason: ...
```

If any entry is `Required: No`, remove it from the fix before Gate 3.

## Sequence for Bug Fix Implementation

1. Reproduce the bug with a failing test (write the test that WOULD HAVE CAUGHT this bug)
2. Implement the minimal fix
3. Confirm the failing test now passes
4. Run the full test suite — confirm no regressions introduced

The failing test from step 1 becomes the regression test at Stage 4.

## Gate 3 Addition (in addition to net-new checklist)

- [ ] Fix scope log documents every changed file/function
- [ ] No `Required: No` entries remain in the fix scope log
- [ ] A failing test that reproduces the bug was written before the fix was implemented
