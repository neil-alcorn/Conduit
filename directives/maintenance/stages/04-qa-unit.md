<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/maintenance/stages/04-qa-unit.md
# description: Stage 4 QA Unit directive delta for maintenance convoys.
# owner:       HUMAN
# update:      Manual when QA policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 4. Run the FULL test suite, not just the touched area** — dependency and infra changes ripple unpredictably. Compare results against the Stage 0 baseline (run one now if missing).
- **Per-type notes:** DEPENDENCY_UPDATE → watch tests exercising the upgraded API; TECH_DEBT → any test change is a yellow flag (behavior may have changed); PERFORMANCE → check timing/memory assertions; INFRA → run smoke/health checks.
- Gate 4 blocks unless full-suite results are documented vs. baseline and every new failure is explained — never silently skipped.

# Stage 4 — QA Unit Directive (Maintenance)

> **Delta from net-new**: See `directives/net-new/stages/04-qa-unit.md` for the full base directive.
> This file documents only what DIFFERS for maintenance convoys.

## Recommended Model
**claude-sonnet-4-6** — Same as net-new.

## Key Difference: Run the Full Test Suite

For net-new and enhancement convoys, test scope is focused on the touched area. For maintenance, **run the full test suite regardless of what was touched.** Maintenance changes — especially dependency updates and infrastructure changes — can have unexpected ripple effects that targeted testing will not catch.

```bash
npm run test
```

Record full results: total tests, passing, failing, skipped. Compare against the Stage 0 baseline (run the full suite at Stage 0 before making any changes and record the count).

If the full test suite was not run at Stage 0: run it now as a baseline. Document any pre-existing failures before proceeding.

## Maintenance Type — QA Notes

**DEPENDENCY_UPDATE**: Pay special attention to tests that exercise the upgraded package's API. Behavioral changes in packages sometimes break tests in non-obvious ways.

**PERFORMANCE**: Confirm there are no performance tests that now fail (timing assertions, memory assertions). If there are none, note that performance improvement is not measurable via existing tests.

**TECH_DEBT**: The refactored code must produce identical outputs for all existing test inputs. If any test now requires a change, document why — a test change for TECH_DEBT is a yellow flag (it may mean behavior changed).

**INFRA**: Run any smoke tests or health checks that verify connectivity and startup behavior.

## Gate 4 Addition (in addition to net-new checklist)

- [ ] Full test suite was run (not just touched area)
- [ ] Full test suite result is documented and compared against baseline
- [ ] Any new test failures after maintenance are explained (not silently skipped)
