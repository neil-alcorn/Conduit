// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/debug.test.ts
// description: Unit tests for conduit debug command — start, list, unknown subcommand.
// owner:       BOTH
// update:      Manual when debug behavior changes.
// schema:      none
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDebug } from '../commands/debug.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-debug-'));
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

// ─── runDebug — no args ─────────────────────────────────────────────

describe('debug — no args prints usage', () => {
  it('prints usage and does not throw', async () => {
    const cap = captureConsole();
    await runDebug([]);
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('usage:')));
  });
});

// ─── runDebug — start without symptom ───────────────────────────────

describe('debug start — no symptom', () => {
  it('throws when no symptom or title provided', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runDebug(['start', '--repo', dir]),
      /usage:|symptom/
    );
  });
});

// ─── runDebug — list with no sessions ───────────────────────────────

describe('debug list — no sessions', () => {
  it('shows "no debug sessions found" when directory is empty', async () => {
    const dir = tmpDir();
    const cap = captureConsole();
    await runDebug(['list', '--repo', dir]);
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('no debug sessions found')));
  });
});

// ─── runDebug — unknown subcommand ──────────────────────────────────

describe('debug unknown subcommand', () => {
  it('throws with "unknown debug subcommand"', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runDebug(['unknown', '--repo', dir]),
      /unknown debug subcommand/
    );
  });
});
