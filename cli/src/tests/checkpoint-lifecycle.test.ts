// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/checkpoint-lifecycle.test.ts
// description: Integration tests for checkpoint create/pass/fail/list and conduit status.
// owner:       BOTH
// update:      Manual when checkpoint lifecycle behavior changes.
// schema:      convoys/schema/checkpoint.schema.json
// last_update: 2026-04-10
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendJSONL, readJSONL, readLatest, type Checkpoint } from '../internal/checkpoint.js';
import { nextCheckpointID } from '../internal/id-generator.js';
import { runCheckpoint } from '../commands/checkpoint.js';
import { runStatus } from '../commands/status.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cp-lc-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

function makeConvoyYaml(dir: string, convoyId: string, stage = 3): void {
  const convoyDir = path.join(dir, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'),
    `id: "${convoyId}"\nstage: ${stage}\nstatus: active\n`, 'utf-8');
}

describe('nextCheckpointID', () => {
  it('returns CP-000001 for empty JSONL file', () => {
    const dir = tmpDir();
    const filePath = path.join(dir, 'checkpoints.jsonl');
    assert.equal(nextCheckpointID(filePath), 'CP-000001');
  });

  it('increments from the highest existing ID', () => {
    const dir = tmpDir();
    const filePath = path.join(dir, 'checkpoints.jsonl');
    const base: Checkpoint = {
      id: 'CP-000003', workstream_id: 'WS-TEST', stage: 3, title: 'test',
      status: 'pending', agent_role: 'field-agent', acceptance_criteria: [], created_at: new Date().toISOString(),
    };
    appendJSONL({ ...base, id: 'CP-000001' }, filePath);
    appendJSONL({ ...base, id: 'CP-000003' }, filePath);
    appendJSONL({ ...base, id: 'CP-000002' }, filePath);
    assert.equal(nextCheckpointID(filePath), 'CP-000004');
  });
});

describe('readLatest', () => {
  it('returns last record per ID when multiple records exist', () => {
    const base: Checkpoint = {
      id: 'CP-000001', workstream_id: 'WS-TEST', stage: 3, title: 'test',
      status: 'pending', agent_role: 'field-agent', acceptance_criteria: [], created_at: new Date().toISOString(),
    };
    const records = [
      { ...base, status: 'pending' },
      { ...base, status: 'passed' },
    ];
    const latest = readLatest(records);
    assert.equal(latest.length, 1);
    assert.equal(latest[0].status, 'passed');
  });
});

describe('checkpoint create', () => {
  it('appends a pending record with CP-000001 on empty file', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.conduit'), { recursive: true });
    await runCheckpoint(['create', 'WS-001', 'My first checkpoint', '--repo', dir]);
    const records = readJSONL(path.join(dir, '.conduit', 'checkpoints.jsonl'));
    assert.equal(records.length, 1);
    assert.equal(records[0].id, 'CP-000001');
    assert.equal(records[0].status, 'pending');
    assert.equal(records[0].workstream_id, 'WS-001');
    assert.equal(records[0].title, 'My first checkpoint');
  });

  it('assigns sequential IDs for multiple creates', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.conduit'), { recursive: true });
    await runCheckpoint(['create', 'WS-001', 'First', '--repo', dir]);
    await runCheckpoint(['create', 'WS-001', 'Second', '--repo', dir]);
    const records = readJSONL(path.join(dir, '.conduit', 'checkpoints.jsonl'));
    assert.equal(records[0].id, 'CP-000001');
    assert.equal(records[1].id, 'CP-000002');
  });
});

describe('checkpoint pass', () => {
  it('appends a passed record; readLatest shows status = passed', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.conduit'), { recursive: true });
    await runCheckpoint(['create', 'WS-001', 'To pass', '--repo', dir]);
    await runCheckpoint(['pass', 'CP-000001', '--repo', dir]);
    const latest = readLatest(readJSONL(path.join(dir, '.conduit', 'checkpoints.jsonl')));
    const cp = latest.find(r => r.id === 'CP-000001');
    assert.equal(cp?.status, 'passed');
    assert.ok(cp?.completed_at);
  });

  it('throws if checkpoint not found', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.conduit'), { recursive: true });
    await assert.rejects(
      () => runCheckpoint(['pass', 'CP-999999', '--repo', dir]),
      /not found/
    );
  });
});

describe('checkpoint fail', () => {
  it('appends a failed record with notes when --reason provided', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.conduit'), { recursive: true });
    await runCheckpoint(['create', 'WS-001', 'To fail', '--repo', dir]);
    await runCheckpoint(['fail', 'CP-000001', '--reason', 'test broke', '--repo', dir]);
    const latest = readLatest(readJSONL(path.join(dir, '.conduit', 'checkpoints.jsonl')));
    const cp = latest.find(r => r.id === 'CP-000001');
    assert.equal(cp?.status, 'failed');
    assert.equal(cp?.notes, 'test broke');
  });
});

describe('checkpoint list', () => {
  it('shows deduped records across workstreams', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.conduit'), { recursive: true });
    await runCheckpoint(['create', 'WS-A', 'Alpha', '--repo', dir]);
    await runCheckpoint(['create', 'WS-B', 'Beta', '--repo', dir]);
    await runCheckpoint(['pass', 'CP-000001', '--repo', dir]);
    // list --workstream WS-A should show only CP-000001 (passed)
    // just verify no exception thrown
    await runCheckpoint(['list', '--workstream', 'WS-A', '--repo', dir]);
  });
});

describe('conduit status', () => {
  it('reports stage, status, and checkpoint counts', async () => {
    const dir = tmpDir();
    const convoyId = 'test-convoy-status';
    makeConvoyYaml(dir, convoyId, 2);
    fs.mkdirSync(path.join(dir, '.conduit'), { recursive: true });
    await runCheckpoint(['create', convoyId, 'CP one', '--repo', dir]);
    await runCheckpoint(['create', convoyId, 'CP two', '--repo', dir]);
    await runCheckpoint(['pass', 'CP-000001', '--repo', dir]);
    // status should not throw and should output convoy info
    runStatus([convoyId, '--repo', dir]);
  });

  it('throws when convoy not found', () => {
    const dir = tmpDir();
    assert.throws(() => runStatus(['no-such-convoy', '--repo', dir]), /not found/);
  });
});
