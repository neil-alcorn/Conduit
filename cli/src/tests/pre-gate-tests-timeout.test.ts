// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/pre-gate-tests-timeout.test.ts
// description: Defect #3 regression — verify the `tests` executor's compiled-in
//              default timeout is 1200s (raised from 120s → 600s → 1200s as suite
//              grew to 365 tests / ~800s) and that other executors retain the 120s
//              default. Also verifies the per-check override path.
// owner:       BOTH
// update:      Manual when defect #3 contract changes.
// schema:      none
// last_update: 2026-05-20
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TESTS_DEFAULT_TIMEOUT_MS,
  OTHER_DEFAULT_TIMEOUT_MS,
  resolveExecutorTimeout,
} from '../internal/pre-gate-checks.js';

describe('defect #3 — tests executor default timeout', () => {
  it('TESTS_DEFAULT_TIMEOUT_MS is 1200000 (raised from 120000 → 600000 → 1200000)', () => {
    assert.equal(TESTS_DEFAULT_TIMEOUT_MS, 1200000);
  });

  it('OTHER_DEFAULT_TIMEOUT_MS retains 120000 for non-tests executors', () => {
    assert.equal(OTHER_DEFAULT_TIMEOUT_MS, 120000);
  });
});

describe('defect #3 — resolveExecutorTimeout: per-check override + tests-vs-other defaults', () => {
  it('returns 1200000 for `tests` when no override is set', () => {
    assert.equal(resolveExecutorTimeout('tests', undefined), 1200000);
  });

  it('returns 120000 for `build` when no override is set', () => {
    assert.equal(resolveExecutorTimeout('build', undefined), 120000);
  });

  it('returns 120000 for `lint` when no override is set', () => {
    assert.equal(resolveExecutorTimeout('lint', undefined), 120000);
  });

  it('returns 120000 for `audit-summary` when no override is set', () => {
    assert.equal(resolveExecutorTimeout('audit-summary', undefined), 120000);
  });

  it('honors per-check override for `tests` (override beats raised default)', () => {
    assert.equal(resolveExecutorTimeout('tests', 900000), 900000);
  });

  it('honors per-check override for `build` (override beats 120s default)', () => {
    assert.equal(resolveExecutorTimeout('build', 300000), 300000);
  });

  it('treats override of 0 as "no override" — falls back to default', () => {
    // Edge case: 0 is falsy but might mean "explicitly disable timeout" in some
    // ecosystems. Here we treat it as no-override and fall back to default,
    // preferring the safer interpretation.
    assert.equal(resolveExecutorTimeout('tests', 0), 1200000);
    assert.equal(resolveExecutorTimeout('build', 0), 120000);
  });
});
