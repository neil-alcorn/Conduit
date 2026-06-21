// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/conduit-config.test.ts
// description: Tests for ~/.conduit/config.json read/write helpers (CLI-4).
//              Uses CONDUIT_CONFIG_PATH override to point at a temp file so
//              we don't touch the real per-user config.
// owner:       BOTH
// update:      Manual when conduit-config contract changes.
// schema:      none
// last_update: 2026-06-15
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readConfig, writeConfig, upsertRepoEntry, clearConfigCache, autoRegisterCwdRepo } from '../internal/conduit-config.js';

function tmpConfigFile(): { path: string; restore: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cfg-'));
  const p = path.join(dir, 'config.json');
  const orig = process.env.CONDUIT_CONFIG_PATH;
  process.env.CONDUIT_CONFIG_PATH = p;
  clearConfigCache();
  return {
    path: p,
    restore: () => {
      if (orig === undefined) delete process.env.CONDUIT_CONFIG_PATH;
      else process.env.CONDUIT_CONFIG_PATH = orig;
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
      clearConfigCache();
    },
  };
}

describe('readConfig', () => {
  it('returns empty object when no config file exists', () => {
    const { restore } = tmpConfigFile();
    try {
      assert.deepEqual(readConfig(), {});
    } finally { restore(); }
  });

  it('returns empty object on malformed JSON without throwing', () => {
    const { path: p, restore } = tmpConfigFile();
    try {
      fs.writeFileSync(p, '{ this is not json', 'utf-8');
      assert.deepEqual(readConfig(), {});
    } finally { restore(); }
  });

  it('reads back round-tripped JSON', () => {
    const { restore } = tmpConfigFile();
    try {
      writeConfig({ central: '/abs/conduit', repos: { hm: '/abs/hm' } });
      const out = readConfig();
      assert.equal(out.central, '/abs/conduit');
      assert.equal(out.repos?.hm, '/abs/hm');
    } finally { restore(); }
  });
});

describe('writeConfig — atomic', () => {
  it('rename-overwrite leaves no temp files in the config dir', () => {
    const { path: p, restore } = tmpConfigFile();
    try {
      writeConfig({ central: '/x' });
      const dir = path.dirname(p);
      const remaining = fs.readdirSync(dir).filter(f => f.startsWith('.config.json.tmp'));
      assert.equal(remaining.length, 0, `temp files left over: ${remaining.join(', ')}`);
    } finally { restore(); }
  });
});

describe('upsertRepoEntry', () => {
  it('inserts a new entry', () => {
    const { restore } = tmpConfigFile();
    try {
      upsertRepoEntry('hm-sites', '/abs/hm-sites');
      assert.equal(readConfig().repos?.['hm-sites'], '/abs/hm-sites');
    } finally { restore(); }
  });

  it('is idempotent on identical writes', () => {
    const { path: p, restore } = tmpConfigFile();
    try {
      upsertRepoEntry('gamma', '/abs/gamma');
      const mtime1 = fs.statSync(p).mtimeMs;
      // Same value — should be a no-op write
      upsertRepoEntry('gamma', '/abs/gamma');
      const mtime2 = fs.statSync(p).mtimeMs;
      assert.equal(mtime1, mtime2, 'expected no-op write to leave mtime unchanged');
    } finally { restore(); }
  });

  it('overwrites when path changes for the same name', () => {
    const { restore } = tmpConfigFile();
    try {
      upsertRepoEntry('hm-sites', '/abs/old');
      upsertRepoEntry('hm-sites', '/abs/new');
      assert.equal(readConfig().repos?.['hm-sites'], '/abs/new');
    } finally { restore(); }
  });
});

function makeGitRepo(label: string, withConduitMd: boolean): { dir: string; cleanup: () => void } {
  const { execFileSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-ar-${label}-`));
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'pipe' });
  if (withConduitMd) {
    fs.writeFileSync(path.join(dir, 'CONDUIT.md'), '# CONDUIT\n', 'utf-8');
  }
  return {
    dir,
    cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } },
  };
}

describe('autoRegisterCwdRepo', () => {
  it('registers a repo that has CONDUIT.md', () => {
    const { restore } = tmpConfigFile();
    const { dir, cleanup } = makeGitRepo('with-conduit', true);
    try {
      const result = autoRegisterCwdRepo(dir);
      assert.equal(result.registered, true);
      assert.equal(result.name, path.basename(dir));
      const config = readConfig();
      assert.ok(config.repos?.[path.basename(dir)]);
    } finally { restore(); cleanup(); }
  });

  it('does not register a repo without CONDUIT.md', () => {
    const { restore } = tmpConfigFile();
    const { dir, cleanup } = makeGitRepo('no-conduit', false);
    try {
      const result = autoRegisterCwdRepo(dir);
      assert.equal(result.registered, false);
      assert.equal(readConfig().repos, undefined);
    } finally { restore(); cleanup(); }
  });

  it('does not register a non-git directory', () => {
    const { restore } = tmpConfigFile();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-ar-nogit-'));
    try {
      fs.writeFileSync(path.join(dir, 'CONDUIT.md'), '# CONDUIT\n', 'utf-8');
      const result = autoRegisterCwdRepo(dir);
      assert.equal(result.registered, false);
    } finally {
      restore();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('is idempotent — second call returns same result without mismatch', () => {
    const { restore } = tmpConfigFile();
    const { dir, cleanup } = makeGitRepo('idempotent', true);
    try {
      const r1 = autoRegisterCwdRepo(dir);
      const r2 = autoRegisterCwdRepo(dir);
      assert.equal(r1.registered, true);
      assert.equal(r2.registered, true);
      assert.equal(r2.mismatch, undefined, 'second call should not report mismatch');
      assert.equal(r1.name, r2.name);
    } finally { restore(); cleanup(); }
  });

  it('detects and reports path mismatch for existing name', () => {
    const { restore } = tmpConfigFile();
    const { dir, cleanup } = makeGitRepo('mismatch', true);
    const name = path.basename(dir);
    try {
      upsertRepoEntry(name, '/old/stale/path');
      const result = autoRegisterCwdRepo(dir);
      assert.equal(result.registered, true);
      assert.ok(result.mismatch, 'expected mismatch to be reported');
      assert.equal(result.mismatch!.existing, '/old/stale/path');
      const config = readConfig();
      assert.notEqual(config.repos?.[name], '/old/stale/path');
    } finally { restore(); cleanup(); }
  });
});
