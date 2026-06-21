// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/audit-summary.test.ts
// description: Tests for `conduit audit-summary` command. Exercises every
//              documented exit code (0, 1, 2, 3) per AC-14, with the npm
//              spawn seam stubbed so tests don't depend on a live registry.
// owner:       BOTH
// update:      Manual when audit-summary contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditSummary } from '../commands/audit-summary.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'cli', 'src', 'tests', 'fixtures');

function loadFixtureRaw(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8');
}

function makeNodeProject(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-sum-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'fake', version: '0.0.0' }));
  return tmp;
}

describe('auditSummary — exit code 0 (clean)', () => {
  it('exits 0 with "0 advisories — clean" message on clean fixture', async () => {
    const tmp = makeNodeProject();
    const result = await auditSummary({
      cwd: tmp,
      strict: false,
      runNpm: async () => ({ ok: true, json: loadFixtureRaw('npm-audit-clean.json') }),
    });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /0 advisories — clean/);
  });

  it('exits 0 with table when only MODERATE/LOW advisories present (default mode)', async () => {
    const tmp = makeNodeProject();
    const result = await auditSummary({
      cwd: tmp,
      strict: false,
      runNpm: async () => ({ ok: true, json: loadFixtureRaw('npm-audit-mod-only.json') }),
    });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /\|\s*#\s*\|\s*Advisory\s*\|\s*Severity\s*\|\s*Vulnerable Package\s*\|\s*Range\s*\|\s*URL\s*\|/);
    assert.match(result.stdout, /lodash/);
    assert.match(result.stdout, /minimatch/);
  });
});

describe('auditSummary — exit code 1 (block)', () => {
  it('exits 1 when HIGH severity is present (default mode)', async () => {
    const tmp = makeNodeProject();
    const result = await auditSummary({
      cwd: tmp,
      strict: false,
      runNpm: async () => ({ ok: true, json: loadFixtureRaw('npm-audit-high.json') }),
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /GHSA-wf5p-g6vw-rhxx/);
  });

  it('exits 1 under --strict when only MODERATE/LOW are present', async () => {
    const tmp = makeNodeProject();
    const result = await auditSummary({
      cwd: tmp,
      strict: true,
      runNpm: async () => ({ ok: true, json: loadFixtureRaw('npm-audit-mod-only.json') }),
    });
    assert.equal(result.exitCode, 1);
  });

  it('exits 0 under --strict when zero advisories present', async () => {
    // --strict doesn't elevate "clean" into failure.
    const tmp = makeNodeProject();
    const result = await auditSummary({
      cwd: tmp,
      strict: true,
      runNpm: async () => ({ ok: true, json: loadFixtureRaw('npm-audit-clean.json') }),
    });
    assert.equal(result.exitCode, 0);
  });
});

describe('auditSummary — exit code 2 (couldn\'t run)', () => {
  it('exits 2 when no package.json in cwd with the AC-10a message', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-sum-no-pkg-'));
    const result = await auditSummary({
      cwd: tmp,
      strict: false,
      runNpm: async () => { throw new Error('runNpm should not be called when package.json is missing'); },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /no package\.json in/);
    assert.match(result.stderr, /audit-summary requires a Node project root/);
    // stdout must remain empty so wrapper scripts can distinguish exit 2 from advisories-found
    assert.equal(result.stdout, '');
  });
});

describe('auditSummary — exit code 3 (npm itself failed)', () => {
  it('exits 3 when runNpm returns ok:false (spawn error / non-zero npm)', async () => {
    const tmp = makeNodeProject();
    const result = await auditSummary({
      cwd: tmp,
      strict: false,
      runNpm: async () => ({ ok: false, error: 'spawn ENOENT: npm not found on PATH' }),
    });
    assert.equal(result.exitCode, 3);
    assert.match(result.stderr, /spawn ENOENT/);
    assert.equal(result.stdout, '');
  });

  it('exits 3 when runNpm returns malformed JSON', async () => {
    const tmp = makeNodeProject();
    const result = await auditSummary({
      cwd: tmp,
      strict: false,
      runNpm: async () => ({ ok: true, json: 'this is { not json' }),
    });
    assert.equal(result.exitCode, 3);
    assert.match(result.stderr, /failed to parse/i);
    assert.equal(result.stdout, '');
  });
});

describe('auditSummary — multipath dedup', () => {
  it('renders one row for the multipath fixture with truncated chains', async () => {
    const tmp = makeNodeProject();
    const result = await auditSummary({
      cwd: tmp,
      strict: false,
      runNpm: async () => ({ ok: true, json: loadFixtureRaw('npm-audit-multipath.json') }),
    });
    assert.equal(result.exitCode, 0);
    // 5 distinct top-level chains for the same advisory → first 3 + "(+2 more)"
    assert.match(result.stdout, /\(\+2 more\)/);
    // exactly one data row (single deduped advisory)
    const dataRows = result.stdout.split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l));
    assert.equal(dataRows.length, 1);
  });
});
