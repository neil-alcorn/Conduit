// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/migrate-stray-registry.test.ts
// description: End-to-end fixture test for `conduit migrate-stray-registry`
//              (CLI-4 / AC-20 / AC-23 part 2). Mirrors the hm-sites case:
//              one stray active convoy at Stage 3 with a populated audit/
//              tree, one orphan untracked convoy directory the migrator
//              must leave alone for operator review.
// owner:       BOTH
// update:      Manual when migrate-stray-registry contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrateStrayRegistry } from '../commands/migrate-stray-registry.js';
import { clearConfigCache } from '../internal/conduit-config.js';

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}

function setupCentralAndSource(label: string): {
  base: string;
  central: string;
  source: string;
  cleanup: () => void;
} {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-migrate-${label}-`));
  const central = path.join(base, 'central');
  const source = path.join(base, 'source');

  // Central conduit repo
  fs.mkdirSync(path.join(central, 'convoys', 'active'), { recursive: true });
  fs.writeFileSync(path.join(central, 'convoys', 'registry.yaml'), 'convoys: {}\n', 'utf-8');
  git(central, 'init -b master');
  git(central, 'config user.email test@conduit.local');
  git(central, 'config user.name conduit-test');
  git(central, 'add -A');
  git(central, 'commit -m "init central"');

  // Source target repo with a stray registry mirroring the hm-sites case
  fs.mkdirSync(path.join(source, 'convoys', 'active', 'cnv-stray-001', 'audit'), { recursive: true });
  fs.writeFileSync(path.join(source, 'convoys', 'registry.yaml'),
    'convoys:\n  cnv-stray-001:\n    stage: 3\n', 'utf-8');
  fs.writeFileSync(path.join(source, 'convoys', 'active', 'cnv-stray-001', 'convoy.yaml'),
    `id: "cnv-stray-001"\nstage: 3\nstatus: active\nwork_type: net-new\n`, 'utf-8');
  fs.writeFileSync(path.join(source, 'convoys', 'active', 'cnv-stray-001', 'living-spec.md'),
    '# stray spec\n', 'utf-8');
  fs.writeFileSync(path.join(source, 'convoys', 'active', 'cnv-stray-001', 'audit', 'gate-2-request.md'),
    '# stray gate 2 request\n', 'utf-8');

  // Orphan untracked convoy directory — must be left alone (no convoy.yaml)
  fs.mkdirSync(path.join(source, 'convoys', 'active', 'orphan-no-yaml'), { recursive: true });
  fs.writeFileSync(path.join(source, 'convoys', 'active', 'orphan-no-yaml', 'README.md'),
    'orphan placeholder\n', 'utf-8');

  git(source, 'init -b master');
  git(source, 'config user.email test@conduit.local');
  git(source, 'config user.name conduit-test');
  git(source, 'add -A');
  git(source, 'commit -m "init source with stray"');

  const cleanup = (): void => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  return { base, central, source, cleanup };
}

function withEnv<T>(set: Record<string, string>, fn: () => T): T {
  const orig: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(set)) {
    orig[k] = process.env[k];
    process.env[k] = v;
  }
  clearConfigCache();
  try {
    return fn();
  } finally {
    for (const k of Object.keys(set)) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k]!;
    }
    clearConfigCache();
  }
}

describe('migrate-stray-registry — end-to-end', () => {
  it('relocates the stray convoy into central, leaves the orphan, and writes a stub README', async () => {
    const fx = setupCentralAndSource('e2e');
    try {
      await withEnv({ CONDUIT_HOME: fx.central }, async () => {
        await runMigrateStrayRegistry([fx.source]);
      });

      // Central has the migrated convoy
      const migratedDir = path.join(fx.central, 'convoys', 'active', 'cnv-stray-001');
      assert.ok(fs.existsSync(path.join(migratedDir, 'convoy.yaml')), 'central missing migrated convoy.yaml');
      assert.ok(fs.existsSync(path.join(migratedDir, 'audit', 'gate-2-request.md')), 'audit tree not preserved');

      // Source no longer has the migrated convoy or the registry
      assert.equal(fs.existsSync(path.join(fx.source, 'convoys', 'active', 'cnv-stray-001')), false,
        'source still has the migrated convoy directory');
      assert.equal(fs.existsSync(path.join(fx.source, 'convoys', 'registry.yaml')), false,
        'source registry not deleted');

      // Source has the stub README
      const stub = path.join(fx.source, 'convoys', 'README.md');
      assert.ok(fs.existsSync(stub), 'stub README not written');
      assert.match(fs.readFileSync(stub, 'utf-8'), /migrated to central conduit storage/);

      // Orphan (no convoy.yaml) is left alone for operator review
      assert.ok(fs.existsSync(path.join(fx.source, 'convoys', 'active', 'orphan-no-yaml')),
        'orphan directory was silently absorbed — should be left for operator review');

      // Both repos got an explicit-pathspec commit
      const centralLog = git(fx.central, 'log --pretty=%s -n 2');
      assert.match(centralLog, /migrate\(stray-registry\)/);
      const sourceLog = git(fx.source, 'log --pretty=%s -n 2');
      assert.match(sourceLog, /migrate\(stray-registry\)/);
    } finally {
      fx.cleanup();
    }
  });

  it('--dry-run reports the plan without mutating either repo', async () => {
    const fx = setupCentralAndSource('dry-run');
    try {
      const beforeCentralHead = git(fx.central, 'rev-parse HEAD');
      const beforeSourceHead = git(fx.source, 'rev-parse HEAD');
      await withEnv({ CONDUIT_HOME: fx.central }, async () => {
        await runMigrateStrayRegistry([fx.source, '--dry-run']);
      });
      assert.equal(git(fx.central, 'rev-parse HEAD'), beforeCentralHead);
      assert.equal(git(fx.source, 'rev-parse HEAD'), beforeSourceHead);
      // Source still has registry + stray convoy
      assert.ok(fs.existsSync(path.join(fx.source, 'convoys', 'registry.yaml')));
      assert.ok(fs.existsSync(path.join(fx.source, 'convoys', 'active', 'cnv-stray-001')));
    } finally { fx.cleanup(); }
  });

  it('exits 2 when an id collision exists in central (no overwrite)', async () => {
    const fx = setupCentralAndSource('collision');
    try {
      // Pre-seed central with a convoy of the same id
      const collide = path.join(fx.central, 'convoys', 'active', 'cnv-stray-001');
      fs.mkdirSync(collide, { recursive: true });
      fs.writeFileSync(path.join(collide, 'convoy.yaml'),
        `id: "cnv-stray-001"\nstage: 1\nstatus: active\n`, 'utf-8');
      git(fx.central, 'add -A');
      git(fx.central, 'commit -m "pre-seed colliding convoy"');

      process.exitCode = 0;
      await withEnv({ CONDUIT_HOME: fx.central }, async () => {
        await runMigrateStrayRegistry([fx.source]);
      });
      assert.equal(process.exitCode, 2, 'expected exit code 2 on collision');
      process.exitCode = 0;

      // Source untouched
      assert.ok(fs.existsSync(path.join(fx.source, 'convoys', 'active', 'cnv-stray-001')));
      assert.ok(fs.existsSync(path.join(fx.source, 'convoys', 'registry.yaml')));
    } finally { fx.cleanup(); }
  });
});
