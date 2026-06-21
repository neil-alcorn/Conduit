// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/setup-env.ts
// description: Test-suite environment guard, loaded via `node --import` before the test runner. Marks the process as a test run.
// owner:       BOTH
// update:      Manual when the test-run guard changes.
// schema:      none
// last_update: 2026-06-20
// ─────────────────────────────────────────────────────────────────────

process.env.CONDUIT_TEST = '1';

export {};
