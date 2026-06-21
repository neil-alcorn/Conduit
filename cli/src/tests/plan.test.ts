// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/plan.test.ts
// description: Unit tests for conduit plan command — init, show, approve, unknown subcommand.
// owner:       BOTH
// update:      Manual when plan behavior changes.
// schema:      none
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPlan } from '../commands/plan.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-plan-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

/** Isolate `resolveConvoyRoot()` from any real conduit central path during a test.
 *  Sets CONDUIT_HOME to a tmp dir that isn't conduit-shaped + CONDUIT_CONFIG_PATH
 *  to a non-existent path so readConfig() returns empty. Restores on cleanup.
 *  Without this, "no convoy" tests fail when ANY convoy is in the real
 *  convoys/active/ (followons item #7). */
function isolateConduitEnv(stubDir: string): { restore: () => void } {
  const savedHome = process.env.CONDUIT_HOME;
  const savedCfg = process.env.CONDUIT_CONFIG_PATH;
  const savedLegacy = process.env.CONDUIT_LEGACY_RESOLVE;
  process.env.CONDUIT_HOME = stubDir;
  process.env.CONDUIT_CONFIG_PATH = path.join(stubDir, '.no-such-config.json');
  delete process.env.CONDUIT_LEGACY_RESOLVE;
  return {
    restore: () => {
      if (savedHome === undefined) delete process.env.CONDUIT_HOME;
      else process.env.CONDUIT_HOME = savedHome;
      if (savedCfg === undefined) delete process.env.CONDUIT_CONFIG_PATH;
      else process.env.CONDUIT_CONFIG_PATH = savedCfg;
      if (savedLegacy === undefined) delete process.env.CONDUIT_LEGACY_RESOLVE;
      else process.env.CONDUIT_LEGACY_RESOLVE = savedLegacy;
    },
  };
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

// ─── runPlan — no args ──────────────────────────────────────────────

describe('plan — no args prints usage', () => {
  it('prints usage and does not throw', async () => {
    const cap = captureConsole();
    await runPlan([]);
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('usage:')));
  });
});

// ─── runPlan — init without convoy ──────────────────────────────────

describe('plan init — no convoy', () => {
  it('throws when no active convoy exists', async () => {
    const dir = tmpDir();
    const env = isolateConduitEnv(dir);
    try {
      await assert.rejects(
        () => runPlan(['init', '--repo', dir]),
        /no convoys directory found|no active convoy/
      );
    } finally {
      env.restore();
    }
  });
});

// ─── runPlan — show without convoy ──────────────────────────────────

describe('plan show — no convoy', () => {
  it('throws when no active convoy exists', async () => {
    const dir = tmpDir();
    const env = isolateConduitEnv(dir);
    try {
      await assert.rejects(
        () => runPlan(['show', '--repo', dir]),
        /no convoys directory found|no active convoy/
      );
    } finally {
      env.restore();
    }
  });
});

// ─── runPlan — unknown subcommand ───────────────────────────────────

describe('plan unknown subcommand', () => {
  it('throws with "unknown plan subcommand"', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runPlan(['unknown', '--repo', dir]),
      /unknown plan subcommand/
    );
  });
});
