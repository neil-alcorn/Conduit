// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/convoy-events.test.ts
// description: Tests verifying events.jsonl is written correctly by gate and checkpoint commands.
// owner:       BOTH
// update:      Manual when event instrumentation changes.
// schema:      convoys/schema/events.schema.json
// last_update: 2026-04-10
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGate } from '../commands/gate.js';
import { runCheckpoint } from '../commands/checkpoint.js';
import { readConvoyEvents, appendConvoyEvent } from '../internal/convoy-events.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: "${new Date().toISOString().slice(0, 10)}"\n\`\`\`\n`;

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-ev-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

function makeConvoy(repoDir: string, convoyId: string, stage: number): string {
  const convoyDir = path.join(repoDir, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'),
    `id: "${convoyId}"\nstage: ${stage}\nstatus: active\n`, 'utf-8');
  return convoyDir;
}

describe('readConvoyEvents — last option', () => {
  it('returns full history by default', () => {
    const repo = tmpRepo();
    const convoyDir = makeConvoy(repo, 'cnv-ev-tail-1', 0);
    for (let i = 0; i < 50; i++) {
      appendConvoyEvent({ ts: new Date(Date.now() + i).toISOString(), type: 'model_usage', convoy: 'cnv-ev-tail-1', stage: 0, usage: { model: 'claude-haiku-4-5' } }, convoyDir);
    }
    const events = readConvoyEvents(convoyDir);
    assert.equal(events.length, 50);
  });

  it('returns only the last N events when { last: N } is passed', () => {
    const repo = tmpRepo();
    const convoyDir = makeConvoy(repo, 'cnv-ev-tail-2', 0);
    for (let i = 0; i < 50; i++) {
      appendConvoyEvent({ ts: new Date(2026, 0, 1, 0, 0, i).toISOString(), type: 'model_usage', convoy: 'cnv-ev-tail-2', stage: 0, usage: { model: `m${i}` } }, convoyDir);
    }
    const events = readConvoyEvents(convoyDir, { last: 5 });
    assert.equal(events.length, 5);
    // Last 5 events written were m45..m49
    assert.deepEqual(events.map(e => e.usage?.model), ['m45', 'm46', 'm47', 'm48', 'm49']);
  });

  it('ignores { last } when it exceeds total event count', () => {
    const repo = tmpRepo();
    const convoyDir = makeConvoy(repo, 'cnv-ev-tail-3', 0);
    for (let i = 0; i < 3; i++) {
      appendConvoyEvent({ ts: new Date(2026, 0, 1, 0, 0, i).toISOString(), type: 'model_usage', convoy: 'cnv-ev-tail-3', stage: 0, usage: { model: 'x' } }, convoyDir);
    }
    const events = readConvoyEvents(convoyDir, { last: 999 });
    assert.equal(events.length, 3);
  });
});

describe('gate approve events', () => {
  it('writes gate_passed and stage_started events to events.jsonl', async () => {
    const repo = tmpRepo();
    const convoyDir = makeConvoy(repo, 'cnv-ev-001', 1);
    appendConvoyEvent({ ts: new Date().toISOString(), type: 'gate_requested', convoy: 'cnv-ev-001', gate: 'spec', stage: 1, approver: 'test' }, convoyDir);
    await runGate(['approve', 'cnv-ev-001', 'spec', '--repo', repo]);
    const events = readConvoyEvents(convoyDir);
    assert.equal(events.length, 3); // gate_requested (auto) + gate_passed + stage_started
    assert.equal(events[0].type, 'gate_requested');
    assert.equal(events[1].type, 'gate_passed');
    assert.equal(events[1].gate, 'spec');
    assert.equal(events[1].stage, 1);
    assert.equal(events[2].type, 'stage_started');
    assert.equal(events[2].stage, 2);
  });

  it('gate_passed event has required fields', async () => {
    const repo = tmpRepo();
    const convoyDir = makeConvoy(repo, 'cnv-ev-002', 0);
    appendConvoyEvent({ ts: new Date().toISOString(), type: 'gate_requested', convoy: 'cnv-ev-002', gate: 'design', stage: 0, approver: 'test' }, convoyDir);
    await runGate(['approve', 'cnv-ev-002', 'design', '--repo', repo]);
    const events = readConvoyEvents(convoyDir);
    const gp = events.find(e => e.type === 'gate_passed');
    assert.ok(gp);
    assert.ok(gp.ts);
    assert.equal(gp.convoy, 'cnv-ev-002');
    assert.equal(gp.gate, 'design');
    assert.ok(gp.approver);
  });
});

describe('gate reject events', () => {
  it('writes gate_rejected to events.jsonl and does NOT write stage_started', async () => {
    const repo = tmpRepo();
    const convoyDir = makeConvoy(repo, 'cnv-ev-003', 2);
    await runGate(['reject', 'cnv-ev-003', 'qa', '--reason', 'tests fail', '--repo', repo]);
    const events = readConvoyEvents(convoyDir);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'gate_rejected');
    assert.equal(events[0].reason, 'tests fail');
    assert.equal(events[0].stage, 2);
  });
});

describe('checkpoint pass/fail events', () => {
  it('checkpoint pass writes checkpoint_passed event to convoy events.jsonl', async () => {
    const repo = tmpRepo();
    const convoyId = 'cnv-ev-004';
    const convoyDir = makeConvoy(repo, convoyId, 3);
    fs.mkdirSync(path.join(repo, '.conduit'), { recursive: true });
    // Create a checkpoint with workstream_id = convoyId
    await runCheckpoint(['create', convoyId, 'Test step', '--repo', repo]);
    await runCheckpoint(['pass', 'CP-000001', '--repo', repo]);
    const events = readConvoyEvents(convoyDir);
    const cpEvent = events.find(e => e.type === 'checkpoint_passed');
    assert.ok(cpEvent, 'expected checkpoint_passed event');
    assert.equal(cpEvent?.checkpoint, 'CP-000001');
    assert.equal(cpEvent?.convoy, convoyId);
  });

  it('checkpoint fail writes checkpoint_failed event', async () => {
    const repo = tmpRepo();
    const convoyId = 'cnv-ev-005';
    const convoyDir = makeConvoy(repo, convoyId, 3);
    fs.mkdirSync(path.join(repo, '.conduit'), { recursive: true });
    await runCheckpoint(['create', convoyId, 'Failing step', '--repo', repo]);
    await runCheckpoint(['fail', 'CP-000001', '--reason', 'broke', '--repo', repo]);
    const events = readConvoyEvents(convoyDir);
    const cpEvent = events.find(e => e.type === 'checkpoint_failed');
    assert.ok(cpEvent, 'expected checkpoint_failed event');
    assert.equal(cpEvent?.checkpoint, 'CP-000001');
  });

  it('checkpoint pass silently skips event when workstream is not a convoy', async () => {
    const repo = tmpRepo();
    fs.mkdirSync(path.join(repo, '.conduit'), { recursive: true });
    // workstream_id 'WS-NOT-CONVOY' has no convoys/active/ entry
    await runCheckpoint(['create', 'WS-NOT-CONVOY', 'Orphan step', '--repo', repo]);
    // Should not throw even though there is no convoy dir
    await assert.doesNotReject(() => runCheckpoint(['pass', 'CP-000001', '--repo', repo]));
  });
});
