// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/execute.test.ts
// description: Unit tests for conduit execute command — start, status, unknown subcommand.
// owner:       BOTH
// update:      Manual when execute behavior changes.
// schema:      none
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runExecute } from '../commands/execute.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-exec-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

function makeConvoy(repoDir: string, convoyId: string): string {
  const convoyDir = path.join(repoDir, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'),
    `id: "${convoyId}"\nstage: 3\nstatus: active\n`, 'utf-8');
  return convoyDir;
}

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  console.error = (...args: unknown[]) => lines.push('[err] ' + args.join(' '));
  return {
    lines,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
  };
}

// ─── runExecute — no args ───────────────────────────────────────────

describe('execute — no args prints usage', () => {
  it('prints usage and does not throw', async () => {
    const cap = captureConsole();
    await runExecute([]);
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('usage:')));
  });
});

// ─── runExecute — start without plan ────────────────────────────────

describe('execute start — no plan', () => {
  it('throws "no plan found" when convoy has no plan.md', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-exec-001');
    await assert.rejects(
      () => runExecute(['start', 'cnv-exec-001', '--repo', dir]),
      /no plan found/
    );
  });
});

// ─── runExecute — status without manifest ───────────────────────────

describe('execute status — no active execution', () => {
  it('shows "no active execution" when no manifest exists', async () => {
    const dir = tmpDir();
    makeConvoy(dir, 'cnv-exec-002');
    const cap = captureConsole();
    await runExecute(['status', 'cnv-exec-002', '--repo', dir]);
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('no active execution')));
  });
});

// ─── runExecute — unknown subcommand ────────────────────────────────

describe('execute unknown subcommand', () => {
  it('throws with "unknown execute subcommand"', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runExecute(['unknown', '--repo', dir]),
      /unknown execute subcommand/
    );
  });
});
