// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/resolve-convoy-root.test.ts
// description: Tests for the central-only resolveConvoyRoot (CLI-4 / AC-16
//              and AC-23). Covers the four resolution paths plus the
//              CONDUIT_LEGACY_RESOLVE escape hatch.
// owner:       BOTH
// update:      Manual when resolution contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveConvoyRoot, resolveTargetRepoPath, ConduitNotInitializedError } from '../utils.js';
import { writeConfig, clearConfigCache } from '../internal/conduit-config.js';

interface EnvSnapshot {
  CONDUIT_HOME?: string;
  CONDUIT_LEGACY_RESOLVE?: string;
  CONDUIT_CONFIG_PATH?: string;
}

function snapshotEnv(): EnvSnapshot {
  return {
    CONDUIT_HOME: process.env.CONDUIT_HOME,
    CONDUIT_LEGACY_RESOLVE: process.env.CONDUIT_LEGACY_RESOLVE,
    CONDUIT_CONFIG_PATH: process.env.CONDUIT_CONFIG_PATH,
  };
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const key of Object.keys(snap) as (keyof EnvSnapshot)[]) {
    if (snap[key] === undefined) delete process.env[key];
    else process.env[key] = snap[key]!;
  }
  clearConfigCache();
}

function makeConduitShaped(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-rcr-${label}-`));
  fs.mkdirSync(path.join(dir, 'convoys', 'active'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'convoys', 'registry.yaml'), 'convoys: {}\n', 'utf-8');
  return dir;
}

function makeNonConduitDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `conduit-rcr-${label}-`));
}

describe('resolveConvoyRoot — env-only', () => {
  it('returns CONDUIT_HOME when only env is set', () => {
    const snap = snapshotEnv();
    const conduit = makeConduitShaped('env-only');
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cfg-'));
    process.env.CONDUIT_HOME = conduit;
    process.env.CONDUIT_CONFIG_PATH = path.join(cfgDir, 'missing.json');
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    clearConfigCache();
    try {
      const start = makeNonConduitDir('env-only-start');
      assert.equal(resolveConvoyRoot(start), conduit);
    } finally {
      restoreEnv(snap);
      try { fs.rmSync(conduit, { recursive: true, force: true }); } catch { /* */ }
      try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});

describe('resolveConvoyRoot — config-only', () => {
  it('returns config.central when only config is set', () => {
    const snap = snapshotEnv();
    const conduit = makeConduitShaped('cfg-only');
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cfg-'));
    process.env.CONDUIT_CONFIG_PATH = path.join(cfgDir, 'config.json');
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    clearConfigCache();
    writeConfig({ central: conduit });
    try {
      const start = makeNonConduitDir('cfg-only-start');
      assert.equal(resolveConvoyRoot(start), conduit);
    } finally {
      restoreEnv(snap);
      try { fs.rmSync(conduit, { recursive: true, force: true }); } catch { /* */ }
      try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});

describe('resolveConvoyRoot — both with env priority', () => {
  it('env wins when both env and config are set', () => {
    const snap = snapshotEnv();
    const envConduit = makeConduitShaped('both-env');
    const cfgConduit = makeConduitShaped('both-cfg');
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cfg-'));
    process.env.CONDUIT_HOME = envConduit;
    process.env.CONDUIT_CONFIG_PATH = path.join(cfgDir, 'config.json');
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    clearConfigCache();
    writeConfig({ central: cfgConduit });
    try {
      const start = makeNonConduitDir('both-start');
      assert.equal(resolveConvoyRoot(start), envConduit);
    } finally {
      restoreEnv(snap);
      try { fs.rmSync(envConduit, { recursive: true, force: true }); } catch { /* */ }
      try { fs.rmSync(cfgConduit, { recursive: true, force: true }); } catch { /* */ }
      try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});

describe('resolveConvoyRoot — neither set, no startPath provided', () => {
  it('throws ConduitNotInitializedError when nothing can be discovered', () => {
    const snap = snapshotEnv();
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cfg-'));
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    process.env.CONDUIT_CONFIG_PATH = path.join(cfgDir, 'missing.json');
    clearConfigCache();
    try {
      assert.throws(
        () => resolveConvoyRoot(),
        (err: Error) => err instanceof ConduitNotInitializedError && /Conduit not initialized/.test(err.message),
      );
    } finally {
      restoreEnv(snap);
      try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  it('NEVER auto-creates a convoy registry as a side effect', () => {
    const snap = snapshotEnv();
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cfg-'));
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    process.env.CONDUIT_CONFIG_PATH = path.join(cfgDir, 'missing.json');
    clearConfigCache();
    try {
      const start = makeNonConduitDir('no-auto-create');
      // With explicit startPath, lenient fallback returns the path — but MUST NOT
      // create convoys/registry.yaml or convoys/active/ as a side effect.
      // (The hm-sites bug was the auto-create, not the path return.)
      const out = resolveConvoyRoot(start);
      assert.equal(out, path.resolve(start));
      assert.equal(fs.existsSync(path.join(start, 'convoys', 'registry.yaml')), false);
      assert.equal(fs.existsSync(path.join(start, 'convoys', 'active')), false);
    } finally {
      restoreEnv(snap);
      try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});

describe('resolveConvoyRoot — explicit conduit-shaped startPath', () => {
  it('returns startPath when it has convoys/registry.yaml even with neither env nor config set', () => {
    const snap = snapshotEnv();
    const conduit = makeConduitShaped('explicit');
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cfg-'));
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    process.env.CONDUIT_CONFIG_PATH = path.join(cfgDir, 'missing.json');
    clearConfigCache();
    try {
      assert.equal(resolveConvoyRoot(conduit), conduit);
    } finally {
      restoreEnv(snap);
      try { fs.rmSync(conduit, { recursive: true, force: true }); } catch { /* */ }
      try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});

describe('resolveConvoyRoot — CONDUIT_LEGACY_RESOLVE escape hatch', () => {
  it('walks up from startPath when legacy mode is enabled', () => {
    const snap = snapshotEnv();
    const root = makeConduitShaped('legacy-root');
    const nested = path.join(root, 'sub', 'deep');
    fs.mkdirSync(nested, { recursive: true });
    process.env.CONDUIT_LEGACY_RESOLVE = '1';
    clearConfigCache();
    try {
      // Without legacy mode, nested has no convoys/active; resolve would fail.
      // With legacy mode, the walk finds the parent `root` by climbing up.
      assert.equal(resolveConvoyRoot(nested), root);
    } finally {
      restoreEnv(snap);
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});

describe('resolveTargetRepoPath — pre-CLI-4 convoy without metadata block', () => {
  it('infers target_repo: conduit and returns the convoy root', () => {
    const conduit = makeConduitShaped('rtr-pre-meta');
    const cnvDir = path.join(conduit, 'convoys', 'active', 'cnv-pre');
    fs.mkdirSync(cnvDir, { recursive: true });
    fs.writeFileSync(path.join(cnvDir, 'convoy.yaml'),
      `id: cnv-pre\nstage: 2\nstatus: active\n`, 'utf-8');
    try {
      assert.equal(resolveTargetRepoPath('cnv-pre', conduit), conduit);
    } finally {
      try { fs.rmSync(conduit, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  it('resolves an explicit metadata.target_repo via config.repos map', () => {
    const snap = snapshotEnv();
    const conduit = makeConduitShaped('rtr-meta');
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtr-target-'));
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cfg-'));
    process.env.CONDUIT_CONFIG_PATH = path.join(cfgDir, 'config.json');
    clearConfigCache();
    writeConfig({ central: conduit, repos: { 'hm-sites': targetDir } });

    const cnvDir = path.join(conduit, 'convoys', 'active', 'cnv-meta');
    fs.mkdirSync(cnvDir, { recursive: true });
    fs.writeFileSync(path.join(cnvDir, 'convoy.yaml'),
      `id: cnv-meta\nstage: 2\nstatus: active\nmetadata:\n  target_repo: hm-sites\n  target_repo_path: ${targetDir}\n`, 'utf-8');
    try {
      assert.equal(resolveTargetRepoPath('cnv-meta', conduit), targetDir);
    } finally {
      restoreEnv(snap);
      try { fs.rmSync(conduit, { recursive: true, force: true }); } catch { /* */ }
      try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch { /* */ }
      try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});
