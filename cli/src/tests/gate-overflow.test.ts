// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/gate-overflow.test.ts
// description: Tests for C5 (stage overflow). Validates that incrementing
//              stage past 8 throws an error.
// owner:       BOTH
// update:      Manual when gate stage logic changes.
// schema:      none
// last_update: 2026-04-20
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGate } from '../commands/gate.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-overflow-'));
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

describe('gate approve — C5 stage overflow', () => {
  it('succeeds at stage 8 (final gate) without incrementing past 8', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-overflow', 8);
    // Gate 8 is the final gate — should succeed and stage stays at 8
    appendConvoyEvent({ ts: new Date().toISOString(), type: 'gate_requested', convoy: 'cnv-overflow', gate: 'gate-8', stage: 8, approver: 'test' }, convoyDir);
    await runGate(['approve', 'cnv-overflow', 'gate-8', '--repo', dir]);
    const content = fs.readFileSync(path.join(convoyDir, 'convoy.yaml'), 'utf-8');
    const match = content.match(/^stage:\s*(\d+)/m);
    assert.equal(match ? parseInt(match[1], 10) : -1, 8, 'stage should remain at 8 after final gate');
  });

  it('succeeds when incrementing from stage 7 to 8 (just under limit)', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-edge', 7);
    appendConvoyEvent({ ts: new Date().toISOString(), type: 'gate_requested', convoy: 'cnv-edge', gate: 'gate-7', stage: 7, approver: 'test' }, convoyDir);
    await runGate(['approve', 'cnv-edge', 'gate-7', '--repo', dir]);
    const content = fs.readFileSync(path.join(convoyDir, 'convoy.yaml'), 'utf-8');
    const match = content.match(/^stage:\s*(\d+)/m);
    assert.equal(match ? parseInt(match[1], 10) : -1, 8, 'stage should increment from 7 to 8');
  });
});
