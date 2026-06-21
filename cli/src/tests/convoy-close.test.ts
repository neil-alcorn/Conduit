// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/convoy-close.test.ts
// description: Unit tests for `conduit convoy close` flag wiring — released vs withdrawn,
//              Gate-8 precondition, --reason validation, terminal-status reject.
// owner:       BOTH
// update:      Manual when close behavior changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runConvoy } from '../commands/convoy.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';
import { warnIfDeprecatedStatus } from '../commands/validate.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-close-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  // Seed an empty registry so updateConvoyRegistryClose has something to update
  fs.mkdirSync(path.join(dir, 'convoys'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'convoys', 'registry.yaml'), 'convoys:\n  active: []\n  archived: []\n', 'utf-8');
  return dir;
}

function makeConvoy(repoDir: string, convoyId: string, stage: number, status = 'active'): string {
  const convoyDir = path.join(repoDir, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  const yamlContent =
    `# ── CONDUIT MANAGED FILE ────────────────────────────────────────────\n` +
    `# last_update: 2026-04-01\n` +
    `# ─────────────────────────────────────────────────────────────────────\n` +
    `id: "${convoyId}"\n` +
    `stage: ${stage}\n` +
    `status: ${status}\n`;
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'), yamlContent, 'utf-8');
  return convoyDir;
}

function seedGateEvent(convoyDir: string, gate: string, type: 'gate_passed' | 'gate_rejected' | 'gate_skipped' | 'gate_requested'): void {
  appendConvoyEvent({ ts: new Date().toISOString(), type, convoy: 'x', gate, stage: 0, approver: 'test' }, convoyDir);
}

function readYaml(repoDir: string, archiveOrActive: 'active' | 'archive', id: string): string {
  return fs.readFileSync(path.join(repoDir, 'convoys', archiveOrActive, id, 'convoy.yaml'), 'utf-8');
}

describe('convoy close — happy paths', () => {
  it('AC-1: Gate-8-approved convoy closes as released', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-rel-1', 8);
    // Real gate.ts emits the user-supplied gate name (e.g., 'gate-8'), not '8'.
    // Stage 8 dogfood of convoy-vocabulary caught this shape mismatch.
    seedGateEvent(convoyDir, 'gate-8', 'gate_passed');

    await runConvoy(['close', 'cnv-rel-1', '--repo', dir]);

    const archived = readYaml(dir, 'archive', 'cnv-rel-1');
    assert.match(archived, /^status:\s*released/m, 'status should be released');
    assert.match(archived, /^released_at:\s*"[^"]+"/m, 'released_at should be recorded');
    assert.equal(fs.existsSync(path.join(dir, 'convoys', 'active', 'cnv-rel-1')), false, 'active dir should be gone');
  });

  it('AC-2: --withdrawn --reason closes as withdrawn with reason', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-wd-1', 4);

    await runConvoy(['close', 'cnv-wd-1', '--withdrawn', '--reason', 'abandoned: stakeholder pulled funding 2026-04-30', '--repo', dir]);

    const archived = readYaml(dir, 'archive', 'cnv-wd-1');
    assert.match(archived, /^status:\s*withdrawn/m, 'status should be withdrawn');
    assert.match(archived, /^withdrawn_at:\s*"[^"]+"/m, 'withdrawn_at should be recorded');
    assert.match(archived, /^withdrawn_reason:\s*"abandoned: stakeholder pulled funding/m, 'withdrawn_reason should be recorded');
  });

  it('AC-2 — withdrawn close works even at stage < 8 (the whole point)', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-wd-2', 2);

    await runConvoy(['close', 'cnv-wd-2', '--withdrawn', '--reason', 'never reached design — descoped at planning', '--repo', dir]);

    assert.equal(fs.existsSync(path.join(dir, 'convoys', 'archive', 'cnv-wd-2', 'convoy.yaml')), true);
  });
});

describe('convoy close — unhappy paths', () => {
  it('AC-5: closing without --withdrawn when Gate 8 not approved fails', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-no-g8', 8);
    seedGateEvent(convoyDir, 'gate-3', 'gate_passed');

    await assert.rejects(
      () => runConvoy(['close', 'cnv-no-g8', '--repo', dir]),
      /cannot close cnv-no-g8 as released — Gate 8 not approved \(most recent gate: gate-3:approve\)/,
    );
    // Active dir should still exist (no state mutation on failure)
    assert.equal(fs.existsSync(path.join(dir, 'convoys', 'active', 'cnv-no-g8', 'convoy.yaml')), true);
  });

  it('AC-5: detection works for gate-N normalization (real event shape)', async () => {
    // Regression test for the Stage 8 dogfood find: gate.ts records `gate: "gate-8"`
    // but the WS1 happy-path check originally used String(e.gate) === '8'. Now
    // the check normalizes "gate-8" → "8" before comparing, so both shapes work.
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-shape', 8);
    seedGateEvent(convoyDir, 'gate-8', 'gate_passed');
    await runConvoy(['close', 'cnv-shape', '--repo', dir]);
    const archived = fs.readFileSync(path.join(dir, 'convoys', 'archive', 'cnv-shape', 'convoy.yaml'), 'utf-8');
    assert.match(archived, /^status:\s*released/m);
  });

  it('AC-6: --withdrawn without --reason fails fast', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-no-reason', 4);
    await assert.rejects(
      () => runConvoy(['close', 'cnv-no-reason', '--withdrawn', '--repo', dir]),
      /--reason is required when --withdrawn is set/,
    );
  });

  it('AC-6b: --withdrawn --reason with under 10 chars fails', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-short', 4);
    await assert.rejects(
      () => runConvoy(['close', 'cnv-short', '--withdrawn', '--reason', 'short', '--repo', dir]),
      /minimum 10 chars/,
    );
  });

  it('AC-7: closing an already-released convoy is rejected as terminal', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-term', 8, 'released');

    await assert.rejects(
      () => runConvoy(['close', 'cnv-term', '--repo', dir]),
      /released and withdrawn are terminal states/,
    );
  });

  it('AC-7: pause cannot mutate a released convoy', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-pause-term', 8, 'released');
    await assert.rejects(
      () => runConvoy(['pause', 'cnv-pause-term', '--repo', dir]),
      /released and withdrawn are terminal states/,
    );
  });

  it('AC-7: resume cannot mutate a withdrawn convoy', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-resume-term', 4, 'withdrawn');
    await assert.rejects(
      () => runConvoy(['resume', 'cnv-resume-term', '--repo', dir]),
      /released and withdrawn are terminal states/,
    );
  });
});

describe('convoy close — LEARNING CHECK hook (AC-7 / AC-17)', () => {
  it('prints LEARNING CHECK after a successful released close without affecting archive state', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoy(dir, 'cnv-lrn-1', 8);
    seedGateEvent(convoyDir, 'gate-8', 'gate_passed');

    const lines: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); origLog(...args); };
    try {
      await runConvoy(['close', 'cnv-lrn-1', '--repo', dir]);
    } finally {
      console.log = origLog;
    }

    assert.ok(lines.some(l => l.includes('LEARNING CHECK')), 'LEARNING CHECK must appear in close output');
    // AC-17: archive state correct regardless of hook output
    const archived = fs.readFileSync(path.join(dir, 'convoys', 'archive', 'cnv-lrn-1', 'convoy.yaml'), 'utf-8');
    assert.match(archived, /^status:\s*released/m);
  });
});

describe('convoy.yaml deprecation warning (AC-4 unhappy)', () => {
  it('warnIfDeprecatedStatus emits a CONDUIT warn line for status=closed', () => {
    const yamlContent = 'id: "cnv-z"\nstage: 8\nstatus: closed\n';
    const captured: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => captured.push(String(msg));
    try {
      warnIfDeprecatedStatus(yamlContent, 'cnv-z');
    } finally {
      console.warn = origWarn;
    }
    assert.equal(captured.length, 1);
    assert.match(captured[0], /deprecated status 'closed'/);
    assert.match(captured[0], /cnv-z/);
  });

  it('warnIfDeprecatedStatus is silent for status=released', () => {
    const yamlContent = 'id: "cnv-z"\nstage: 8\nstatus: released\n';
    const captured: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => captured.push(String(msg));
    try {
      warnIfDeprecatedStatus(yamlContent, 'cnv-z');
    } finally {
      console.warn = origWarn;
    }
    assert.equal(captured.length, 0);
  });
});
