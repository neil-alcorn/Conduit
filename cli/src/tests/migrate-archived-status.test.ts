// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/migrate-archived-status.test.ts
// description: Unit tests for the one-time archived-status migration script —
//              idempotency, dry-run, default-released, withdrawn untouched.
// owner:       BOTH
// update:      Manual when migration semantics change.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigration } from '../../../scripts/migrate-archived-status.js';

interface ArchiveSeed {
  id: string;
  status?: string;
}

function seedArchiveRepo(seeds: ArchiveSeed[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-mig-'));
  fs.mkdirSync(path.join(dir, 'convoys', 'archive'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });

  const archivedEntries = seeds.map(s => ({ id: s.id, path: `convoys/archive/${s.id}/`, status: s.status ?? 'closed' }));
  const registry = `convoys:\n  active: []\n  archived:\n${archivedEntries.map(e => `    - id: ${e.id}\n      path: ${e.path}\n      status: ${e.status}\n`).join('')}`;
  fs.writeFileSync(path.join(dir, 'convoys', 'registry.yaml'), registry, 'utf-8');

  for (const s of seeds) {
    const cdir = path.join(dir, 'convoys', 'archive', s.id);
    fs.mkdirSync(cdir, { recursive: true });
    const yamlBody =
      `# ── CONDUIT MANAGED FILE ────────────────────────────────────────────\n` +
      `# last_update: 2026-04-01\n` +
      `# ─────────────────────────────────────────────────────────────────────\n` +
      `id: "${s.id}"\n` +
      `stage: 8\n` +
      (s.status ? `status: ${s.status}\n` : '');
    fs.writeFileSync(path.join(cdir, 'convoy.yaml'), yamlBody, 'utf-8');
  }
  return dir;
}

function readStatus(dir: string, id: string): string | null {
  const yamlPath = path.join(dir, 'convoys', 'archive', id, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) return null;
  const raw = fs.readFileSync(yamlPath, 'utf-8');
  const m = raw.match(/^status:\s*["']?([^"'\s\n]+)["']?/m);
  return m ? m[1] : null;
}

describe('migrate-archived-status — happy paths', () => {
  it('AC-8: defaults legacy closed and missing-status to released; preserves withdrawn', () => {
    const dir = seedArchiveRepo([
      { id: 'a-no-status' /* missing status */ },
      { id: 'b-closed', status: 'closed' },
      { id: 'c-closed', status: 'closed' },
      { id: 'd-released', status: 'released' },
      { id: 'e-withdrawn', status: 'withdrawn' },
    ]);

    const summary = runMigration({ repoPath: dir, dryRun: false, push: false, noCommit: true });

    assert.equal(summary.results.length, 5);
    assert.equal(summary.changedConvoys.length, 3);
    assert.equal(readStatus(dir, 'a-no-status'), 'released');
    assert.equal(readStatus(dir, 'b-closed'), 'released');
    assert.equal(readStatus(dir, 'c-closed'), 'released');
    assert.equal(readStatus(dir, 'd-released'), 'released');
    assert.equal(readStatus(dir, 'e-withdrawn'), 'withdrawn');
  });

  it('AC-8b: idempotent — second run is a no-op', () => {
    const dir = seedArchiveRepo([
      { id: 'one', status: 'closed' },
      { id: 'two', status: 'withdrawn' },
    ]);

    runMigration({ repoPath: dir, dryRun: false, push: false, noCommit: true });
    const summary2 = runMigration({ repoPath: dir, dryRun: false, push: false, noCommit: true });

    assert.equal(summary2.changedConvoys.length, 0, 'second run should migrate nothing');
  });

  it('AC-8c: --dry-run touches no files', () => {
    const dir = seedArchiveRepo([
      { id: 'foo', status: 'closed' },
    ]);
    const summary = runMigration({ repoPath: dir, dryRun: true, push: false, noCommit: true });

    assert.equal(summary.results.length, 1);
    assert.equal(summary.changedConvoys.length, 1, 'reports the proposed change');
    assert.equal(readStatus(dir, 'foo'), 'closed', 'file unchanged');
    assert.equal(summary.logPath, undefined, 'no log file written in dry-run');
  });

  it('writes a per-run log file when applied', () => {
    const dir = seedArchiveRepo([{ id: 'logged', status: 'closed' }]);
    const summary = runMigration({ repoPath: dir, dryRun: false, push: false, noCommit: true });

    assert.ok(summary.logPath, 'logPath should be set');
    if (summary.logPath) {
      const content = fs.readFileSync(summary.logPath, 'utf-8');
      assert.match(content, /logged/);
      assert.match(content, /migrated:/);
    }
  });

  it('updates registry.yaml archived entries from closed to released', () => {
    const dir = seedArchiveRepo([{ id: 'reg-1', status: 'closed' }]);
    runMigration({ repoPath: dir, dryRun: false, push: false, noCommit: true });

    const registry = fs.readFileSync(path.join(dir, 'convoys', 'registry.yaml'), 'utf-8');
    assert.match(registry, /reg-1/);
    assert.match(registry, /status:\s*released/);
  });

  it('handles an empty archive without crashing', () => {
    const dir = seedArchiveRepo([]);
    const summary = runMigration({ repoPath: dir, dryRun: false, push: false, noCommit: true });
    assert.equal(summary.results.length, 0);
    assert.equal(summary.changedConvoys.length, 0);
  });
});
