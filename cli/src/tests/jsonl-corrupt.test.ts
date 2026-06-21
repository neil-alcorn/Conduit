// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/jsonl-corrupt.test.ts
// description: Tests for C4 (corrupt JSONL). Validates that corrupt lines
//              are skipped gracefully instead of crashing.
// owner:       BOTH
// update:      Manual when JSONL parsing behavior changes.
// schema:      none
// last_update: 2026-04-20
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJSONL } from '../internal/checkpoint.js';
import { readConvoyEvents } from '../internal/convoy-events.js';

describe('readJSONL — C4 corrupt line resilience', () => {
  it('skips corrupt lines and returns only valid records', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-jsonl-'));
    const filePath = path.join(tmp, 'checkpoints.jsonl');

    const valid1 = JSON.stringify({ id: 'CP-0001', workstream_id: 'WS-001', stage: 1, title: 'first', status: 'passed', agent_role: 'dev', acceptance_criteria: [], created_at: '2026-04-20T00:00:00Z' });
    const corrupt = 'garbage{not-json!!!';
    const valid2 = JSON.stringify({ id: 'CP-0002', workstream_id: 'WS-001', stage: 2, title: 'second', status: 'passed', agent_role: 'qa', acceptance_criteria: [], created_at: '2026-04-20T00:01:00Z' });

    fs.writeFileSync(filePath, [valid1, corrupt, valid2].join('\n') + '\n', 'utf-8');

    const records = readJSONL(filePath);
    assert.equal(records.length, 2, 'should return 2 valid records, skipping the corrupt line');
    assert.equal(records[0].id, 'CP-0001');
    assert.equal(records[1].id, 'CP-0002');
  });

  it('returns empty array when all lines are corrupt', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-jsonl-'));
    const filePath = path.join(tmp, 'checkpoints.jsonl');
    fs.writeFileSync(filePath, 'garbage1\ngarbage2\ngarbage3\n', 'utf-8');

    const records = readJSONL(filePath);
    assert.equal(records.length, 0, 'all corrupt lines should be skipped');
  });

  it('handles a file with trailing empty lines gracefully', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-jsonl-'));
    const filePath = path.join(tmp, 'checkpoints.jsonl');
    const valid = JSON.stringify({ id: 'CP-0003', workstream_id: 'WS-001', stage: 1, title: 'only', status: 'passed', agent_role: 'dev', acceptance_criteria: [], created_at: '2026-04-20T00:00:00Z' });
    fs.writeFileSync(filePath, valid + '\n\n\n', 'utf-8');

    const records = readJSONL(filePath);
    assert.equal(records.length, 1);
  });
});

describe('readConvoyEvents — C4 corrupt line resilience', () => {
  it('skips corrupt lines in events.jsonl and returns valid events', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-events-'));
    const eventsPath = path.join(tmp, 'events.jsonl');

    const valid1 = JSON.stringify({ ts: '2026-04-20T00:00:00Z', type: 'convoy_started', convoy: 'CNV-001' });
    const corrupt = '{broken json here';
    const valid2 = JSON.stringify({ ts: '2026-04-20T00:01:00Z', type: 'gate_passed', convoy: 'CNV-001', stage: 1 });

    fs.writeFileSync(eventsPath, [valid1, corrupt, valid2].join('\n') + '\n', 'utf-8');

    const events = readConvoyEvents(tmp);
    assert.equal(events.length, 2, 'should return 2 valid events, skipping the corrupt line');
    assert.equal(events[0].type, 'convoy_started');
    assert.equal(events[1].type, 'gate_passed');
  });
});
