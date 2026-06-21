// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/checkpoint.test.ts
// description: Tests for checkpoint JSONL helpers and round-trip behavior.
// owner:       BOTH
// update:      Manual when checkpoint persistence behavior changes.
// schema:      convoys/schema/checkpoint.schema.json
// last_update: 2026-04-07
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendJSONL, readJSONL, type Checkpoint } from '../internal/checkpoint.js';

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: 'CP-000002',
    workstream_id: 'WS-0001-TST',
    stage: 3,
    title: 'JSONL test checkpoint',
    status: 'passed',
    agent_role: 'qa',
    acceptance_criteria: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('appendJSONL and readJSONL', () => {
  it('round-trips a checkpoint through JSONL', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cp-'));
    const filePath = path.join(tmp, 'checkpoints.jsonl');
    const cp = makeCheckpoint();

    appendJSONL(cp, filePath);
    const records = readJSONL(filePath);

    assert.equal(records.length, 1);
    assert.equal(records[0].id, cp.id);
    assert.equal(records[0].workstream_id, cp.workstream_id);
    assert.equal(records[0].status, cp.status);
  });

  it('returns empty array for missing file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cp-'));
    const records = readJSONL(path.join(tmp, 'missing.jsonl'));
    assert.deepEqual(records, []);
  });

  it('appends multiple records in order', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cp-'));
    const filePath = path.join(tmp, 'checkpoints.jsonl');

    appendJSONL(makeCheckpoint({ id: 'CP-0001' }), filePath);
    appendJSONL(makeCheckpoint({ id: 'CP-0002' }), filePath);
    appendJSONL(makeCheckpoint({ id: 'CP-0003' }), filePath);

    const records = readJSONL(filePath);
    assert.equal(records.length, 3);
    assert.equal(records[0].id, 'CP-0001');
    assert.equal(records[2].id, 'CP-0003');
  });
});
