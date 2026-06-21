// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/session.test.ts
// description: Unit tests for conduit session command — save, resume, unknown subcommand.
// owner:       BOTH
// update:      Manual when session behavior changes.
// schema:      none
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSession } from '../commands/session.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-session-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
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

// ─── runSession — no args ───────────────────────────────────────────

describe('session — no args prints usage', () => {
  it('prints usage and does not throw', async () => {
    const cap = captureConsole();
    await runSession([]);
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('usage:')));
  });
});

// ─── runSession — resume with no handoffs ───────────────────────────

describe('session resume — no handoffs', () => {
  it('shows "no session handoffs found" when no sessions dir exists', async () => {
    const dir = tmpDir();
    const cap = captureConsole();
    await runSession(['resume', '--repo', dir]);
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('no session handoffs found')));
  });
});

// ─── runSession — unknown subcommand ────────────────────────────────

describe('session unknown subcommand', () => {
  it('throws with "unknown session subcommand"', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runSession(['unknown', '--repo', dir]),
      /unknown session subcommand/
    );
  });
});
