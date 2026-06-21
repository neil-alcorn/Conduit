// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/wave-zero.test.ts
// description: Tests for C6 (wave 0 coercion). Validates that tasks with
//              wave "0" stay in wave 0 and are not coerced to wave 1.
// owner:       BOTH
// update:      Manual when wave parsing logic changes.
// schema:      none
// last_update: 2026-04-20
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getWaves, type PlanTask } from '../commands/execute.js';

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 'T-001',
    title: 'Test task',
    repo: 'conduit',
    depends: 'none',
    priority: 'P1',
    wave: '1',
    status: 'pending',
    ...overrides,
  };
}

describe('getWaves — C6 wave 0 coercion', () => {
  it('keeps wave 0 tasks in wave 0 (not coerced to wave 1)', () => {
    const tasks: PlanTask[] = [
      makeTask({ id: 'T-001', wave: '0', title: 'Setup task' }),
      makeTask({ id: 'T-002', wave: '1', title: 'Feature task' }),
    ];

    const waves = getWaves(tasks);

    assert.ok(waves.has(0), 'wave 0 should exist in the map');
    assert.ok(waves.has(1), 'wave 1 should exist in the map');
    assert.equal(waves.get(0)!.length, 1, 'wave 0 should have exactly 1 task');
    assert.equal(waves.get(0)![0].id, 'T-001');
    assert.equal(waves.get(1)!.length, 1, 'wave 1 should have exactly 1 task');
    assert.equal(waves.get(1)![0].id, 'T-002');
  });

  it('defaults tasks with empty wave to wave 1', () => {
    const tasks: PlanTask[] = [
      makeTask({ id: 'T-003', wave: '', title: 'No wave task' }),
    ];

    const waves = getWaves(tasks);

    assert.ok(waves.has(1), 'empty wave should default to wave 1');
    assert.equal(waves.get(1)!.length, 1);
    assert.equal(waves.get(1)![0].id, 'T-003');
  });

  it('groups multiple tasks in wave 0 correctly', () => {
    const tasks: PlanTask[] = [
      makeTask({ id: 'T-010', wave: '0', title: 'Prereq A' }),
      makeTask({ id: 'T-011', wave: '0', title: 'Prereq B' }),
      makeTask({ id: 'T-012', wave: '1', title: 'Main work' }),
    ];

    const waves = getWaves(tasks);

    assert.equal(waves.get(0)!.length, 2, 'wave 0 should have 2 tasks');
    assert.equal(waves.get(1)!.length, 1, 'wave 1 should have 1 task');
  });

  it('handles higher wave numbers correctly', () => {
    const tasks: PlanTask[] = [
      makeTask({ id: 'T-020', wave: '0' }),
      makeTask({ id: 'T-021', wave: '3' }),
      makeTask({ id: 'T-022', wave: '5' }),
    ];

    const waves = getWaves(tasks);
    const keys = [...waves.keys()].sort((a, b) => a - b);
    assert.deepEqual(keys, [0, 3, 5]);
  });
});
