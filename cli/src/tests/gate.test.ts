// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/gate.test.ts
// description: Unit tests for gate approve, reject, request, and audit log writing.
// owner:       BOTH
// update:      Manual when gate mutation behavior changes.
// schema:      none
// last_update: 2026-04-11
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGate } from '../commands/gate.js';
import { readGateLog } from '../internal/gate-events.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-gate-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

function makeConvoy(repoDir: string, convoyId: string, stage: number): string {
  const convoyDir = path.join(repoDir, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  const yamlContent = `id: "${convoyId}"\nstage: ${stage}\nstatus: active\n`;
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'), yamlContent, 'utf-8');
  return convoyDir;
}

function readStageFromYaml(convoyDir: string): number {
  const content = fs.readFileSync(path.join(convoyDir, 'convoy.yaml'), 'utf-8');
  const match = content.match(/^stage:\s*(\d+)/m);
  return match ? parseInt(match[1], 10) : -1;
}

describe('gate approve', () => {
  it('increments stage in convoy.yaml', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-001', 2);
    appendConvoyEvent({ ts: new Date().toISOString(), type: 'gate_requested', convoy: 'cnv-001', gate: 'spec', stage: 2, approver: 'test' }, convoyDir);
    await runGate(['approve', 'cnv-001', 'spec', '--repo', dir]);
    assert.equal(readStageFromYaml(convoyDir), 3);
  });

  it('writes a gate_passed event to events.jsonl', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-002', 1);
    appendConvoyEvent({ ts: new Date().toISOString(), type: 'gate_requested', convoy: 'cnv-002', gate: 'design', stage: 1, approver: 'test' }, convoyDir);
    await runGate(['approve', 'cnv-002', 'design', '--repo', dir]);
    const events = readGateLog(convoyDir);
    assert.equal(events.length, 2); // gate_requested (auto) + gate_passed
    assert.equal(events[0].type, 'gate_requested');
    assert.equal(events[1].type, 'gate_passed');
    assert.equal(events[1].convoy, 'cnv-002');
    assert.equal(events[1].gate, 'design');
    assert.equal(events[1].stage, 1);
  });

  it('throws when convoy does not exist', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runGate(['approve', 'no-such-convoy', 'spec', '--repo', dir]),
      /not found/
    );
  });
});

describe('gate reject', () => {
  it('does NOT increment stage in convoy.yaml', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-003', 4);
    await runGate(['reject', 'cnv-003', 'qa', '--reason', 'tests failing', '--repo', dir]);
    assert.equal(readStageFromYaml(convoyDir), 4);
  });

  it('writes a gate_rejected event with reason to events.jsonl', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-004', 3);
    await runGate(['reject', 'cnv-004', 'spec', '--reason', 'missing AC', '--repo', dir]);
    const events = readGateLog(convoyDir);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'gate_rejected');
    assert.equal(events[0].reason, 'missing AC');
    assert.equal(events[0].stage, 3);
  });

  it('throws when convoy does not exist', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runGate(['reject', 'missing', 'spec', '--reason', 'n/a', '--repo', dir]),
      /not found/
    );
  });
});

describe('gate request', () => {
  // gate request is a context assembler — no API calls, no API key needed.
  // It assembles context from the convoy directory and writes audit/gate-context-N.md.

  it('throws when convoy does not exist', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runGate(['request', 'no-such-convoy', 'gate-0', '--request', path.join(dir, 'req.md'), '--repo', dir]),
      /not found/
    );
  });

  it('assembles context and writes audit/gate-context-0.md', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-rq1', 0);

    const reqFile = path.join(dir, 'request.md');
    fs.writeFileSync(reqFile, 'Feature is implemented and tests pass.', 'utf-8');

    await runGate(['request', 'cnv-rq1', 'gate-0', '--request', reqFile, '--repo', dir]);

    const contextFile = path.join(convoyDir, 'audit', 'gate-context-0.md');
    assert.ok(fs.existsSync(contextFile), 'gate-context-0.md should be written');
    const content = fs.readFileSync(contextFile, 'utf-8');
    assert.ok(content.includes('CONDUIT GATE EVALUATION CONTEXT'));
    assert.ok(content.includes('Feature is implemented and tests pass.'));
    assert.ok(content.includes('Convoy: cnv-rq1'));
  });

  it('includes gate-evaluator directive block and gate criteria in context', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-rq2', 0);

    // Plant a minimal evaluator directive
    const sharedDir = path.join(dir, 'directives', 'shared');
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.writeFileSync(path.join(sharedDir, 'gate-evaluator.md'), '# Gate Evaluator\nEvaluate gates.', 'utf-8');

    // Plant a minimal stage directive with gate criteria
    const stagesDir = path.join(dir, 'directives', 'net-new', 'stages');
    fs.mkdirSync(stagesDir, { recursive: true });
    fs.writeFileSync(path.join(stagesDir, '00-intake.md'), '## Gate 0 Criteria\n- [ ] convoy.yaml complete\n', 'utf-8');

    // convoy.yaml needs work_type for directive resolution
    fs.writeFileSync(
      path.join(dir, 'convoys', 'active', 'cnv-rq2', 'convoy.yaml'),
      'id: "cnv-rq2"\nstage: 0\nstatus: active\nwork_type: "net-new"\n',
      'utf-8'
    );

    const reqFile = path.join(dir, 'request.md');
    fs.writeFileSync(reqFile, 'Done.', 'utf-8');

    await runGate(['request', 'cnv-rq2', 'gate-0', '--request', reqFile, '--repo', dir]);

    const contextFile = path.join(dir, 'convoys', 'active', 'cnv-rq2', 'audit', 'gate-context-0.md');
    const content = fs.readFileSync(contextFile, 'utf-8');
    assert.ok(content.includes('Gate Evaluator'), 'should include evaluator directive');
    assert.ok(content.includes('convoy.yaml complete'), 'should include gate criteria');
  });
});

describe('gate approve — C12 prerequisite guard', () => {
  it('throws when no gate_requested event exists and --skip-request is not used', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-prereq', 0);
    await assert.rejects(
      () => runGate(['approve', 'cnv-prereq', 'gate-0', '--repo', dir]),
      /no gate_requested event found|gate request/i
    );
  });

  it('succeeds when gate_requested event exists (via prior gate request)', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-prereq2', 0);

    // Plant a gate_requested event in events.jsonl
    const eventsPath = path.join(convoyDir, 'events.jsonl');
    const requestEvent = JSON.stringify({
      ts: new Date().toISOString(),
      type: 'gate_requested',
      convoy: 'cnv-prereq2',
      gate: 'gate-0',
      stage: 0,
      approver: 'test',
    });
    fs.writeFileSync(eventsPath, requestEvent + '\n', 'utf-8');

    // Should succeed now that gate_requested exists
    await runGate(['approve', 'cnv-prereq2', 'gate-0', '--repo', dir]);
    assert.equal(readStageFromYaml(convoyDir), 1, 'stage should advance to 1');
  });
});
