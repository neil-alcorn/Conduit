// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/init-global.test.ts
// description: AC-21 end-to-end coverage — `conduit init --global <path>`
//              writes ~/.conduit/config.json `central` after validating
//              path/convoys/registry.yaml; refuses overwrite without --force;
//              accepts overwrite WITH --force; rejects paths without a
//              registry. Closes the AC-21 Stage 4 PARTIAL.
// owner:       BOTH
// update:      Manual when init --global contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInit } from '../commands/init.js';
import { readConfig, writeConfig, clearConfigCache } from '../internal/conduit-config.js';

interface EnvSnap {
  CONDUIT_CONFIG_PATH?: string;
}

function withTmpConfig(label: string): { restore: () => void; cfgPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-init-${label}-`));
  const cfgPath = path.join(dir, 'config.json');
  const orig = process.env.CONDUIT_CONFIG_PATH;
  process.env.CONDUIT_CONFIG_PATH = cfgPath;
  clearConfigCache();
  return {
    cfgPath,
    restore: () => {
      if (orig === undefined) delete process.env.CONDUIT_CONFIG_PATH;
      else process.env.CONDUIT_CONFIG_PATH = orig;
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
      clearConfigCache();
    },
  };
}

function makeConduitShaped(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-target-${label}-`));
  fs.mkdirSync(path.join(dir, 'convoys'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'convoys', 'registry.yaml'),
    'convoys:\n  active: []\n  archived: []\n', 'utf-8');
  return dir;
}

function makeNonConduit(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `conduit-nonconduit-${label}-`));
}

describe('init --global — happy path', () => {
  it('writes config.central after validating path/convoys/registry.yaml exists', async () => {
    const ctx = withTmpConfig('happy');
    const target = makeConduitShaped('happy');
    try {
      await runInit(['--global', target]);
      const cfg = readConfig();
      assert.equal(cfg.central, path.resolve(target));
    } finally {
      ctx.restore();
      try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});

describe('init --global — path validation', () => {
  it('rejects when path/convoys/registry.yaml does not exist', async () => {
    const ctx = withTmpConfig('no-registry');
    const target = makeNonConduit('no-registry');
    try {
      await assert.rejects(
        () => runInit(['--global', target]),
        /does not exist/,
      );
      // Config must NOT have been written
      assert.equal(fs.existsSync(ctx.cfgPath), false, 'config.json was written despite path validation failure');
    } finally {
      ctx.restore();
      try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});

describe('init --global — overwrite protection', () => {
  it('refuses to overwrite an existing different config.central without --force', async () => {
    const ctx = withTmpConfig('overwrite');
    const first = makeConduitShaped('first');
    const second = makeConduitShaped('second');
    try {
      // Pre-seed config with the first path.
      writeConfig({ central: first });
      // Second invocation against a different path should refuse.
      await assert.rejects(
        () => runInit(['--global', second]),
        /already set|overwrite/i,
      );
      // Config must still point at the first path.
      assert.equal(readConfig().central, first);
    } finally {
      ctx.restore();
      try { fs.rmSync(first, { recursive: true, force: true }); } catch { /* */ }
      try { fs.rmSync(second, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  it('accepts overwrite WITH --force', async () => {
    const ctx = withTmpConfig('force');
    const first = makeConduitShaped('first');
    const second = makeConduitShaped('second');
    try {
      writeConfig({ central: first });
      await runInit(['--global', second, '--force']);
      assert.equal(readConfig().central, path.resolve(second));
    } finally {
      ctx.restore();
      try { fs.rmSync(first, { recursive: true, force: true }); } catch { /* */ }
      try { fs.rmSync(second, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  it('is a no-op when --global points at the path already in config.central', async () => {
    const ctx = withTmpConfig('idempotent');
    const target = makeConduitShaped('idempotent');
    try {
      writeConfig({ central: path.resolve(target) });
      await runInit(['--global', target]);
      assert.equal(readConfig().central, path.resolve(target));
    } finally {
      ctx.restore();
      try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});
