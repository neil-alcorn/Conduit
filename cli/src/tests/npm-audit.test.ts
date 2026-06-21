// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/npm-audit.test.ts
// description: Pure-function tests for npm audit JSON parsing, advisory dedup,
//              and markdown rendering. Fixtures pinned against npm 9+ schema.
// owner:       BOTH
// update:      Manual when audit-summary helpers change.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseAuditJson,
  dedupAdvisories,
  renderTable,
  hasBlockingSeverity,
  type AdvisoryRecord,
} from '../internal/npm-audit.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'cli', 'src', 'tests', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8'));
}

describe('parseAuditJson', () => {
  it('returns empty array for clean fixture', () => {
    const records = parseAuditJson(loadFixture('npm-audit-clean.json'));
    assert.deepEqual(records, []);
  });

  it('extracts each advisory record from mod-only fixture', () => {
    const records = parseAuditJson(loadFixture('npm-audit-mod-only.json'));
    assert.equal(records.length, 2);
    const urls = records.map(r => r.url).sort();
    assert.deepEqual(urls, [
      'https://github.com/advisories/GHSA-f8q6-p94x-37v3',
      'https://github.com/advisories/GHSA-jf85-cpcp-j695',
    ]);
  });

  it('captures severity, title, range from advisory object', () => {
    const records = parseAuditJson(loadFixture('npm-audit-mod-only.json'));
    const lodash = records.find(r => r.vulnerablePackage === 'lodash');
    assert.ok(lodash, 'expected lodash advisory');
    assert.equal(lodash!.severity, 'moderate');
    assert.equal(lodash!.title, 'Prototype Pollution in lodash');
    assert.equal(lodash!.range, '<4.17.12');
  });

  it('extracts high-severity advisories from high fixture', () => {
    const records = parseAuditJson(loadFixture('npm-audit-high.json'));
    const high = records.filter(r => r.severity === 'high');
    assert.equal(high.length, 1);
    assert.equal(high[0].url, 'https://github.com/advisories/GHSA-wf5p-g6vw-rhxx');
  });

  it('walks chain string entries without treating them as advisories', () => {
    // socket.io has via: ["ws"] — ws references it. Should not become a separate advisory.
    const records = parseAuditJson(loadFixture('npm-audit-high.json'));
    // Two distinct advisories: axios + ws (socket.io is downstream, no own advisory)
    assert.equal(records.length, 2);
  });

  it('accepts a JSON string as input', () => {
    const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'npm-audit-mod-only.json'), 'utf-8');
    const records = parseAuditJson(raw);
    assert.equal(records.length, 2);
  });

  it('resolves top-level chains via effects walk in multipath fixture', () => {
    const records = parseAuditJson(loadFixture('npm-audit-multipath.json'));
    // tough-cookie is the only advisory; reached via 5 direct deps
    assert.equal(records.length, 1);
    const chains = records[0].topLevelChains.slice().sort();
    assert.deepEqual(chains, ['axios', 'fetch-wrapper', 'got-helper', 'http-client', 'request-promise']);
  });
});

describe('dedupAdvisories', () => {
  it('collapses duplicate URL records into one with merged chains', () => {
    const a: AdvisoryRecord = {
      url: 'https://github.com/advisories/GHSA-x',
      title: 'X',
      severity: 'moderate',
      vulnerablePackage: 'pkg-x',
      range: '<1.0.0',
      topLevelChains: ['alpha', 'beta'],
    };
    const b: AdvisoryRecord = { ...a, topLevelChains: ['beta', 'gamma'] };
    const merged = dedupAdvisories([a, b]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].topLevelChains.slice().sort(), ['alpha', 'beta', 'gamma']);
  });

  it('preserves distinct URLs as separate records', () => {
    const records = parseAuditJson(loadFixture('npm-audit-mod-only.json'));
    const merged = dedupAdvisories(records);
    assert.equal(merged.length, 2);
  });

  it('falls back to GHSA-ID key when URL is missing', () => {
    // Synthetic: two records sharing a GHSA suffix but with empty URL
    const a: AdvisoryRecord = {
      url: '',
      title: 'A',
      severity: 'high',
      vulnerablePackage: 'p',
      range: '*',
      topLevelChains: ['one'],
      ghsaId: 'GHSA-abcd-efgh-ijkl',
    };
    const b: AdvisoryRecord = { ...a, topLevelChains: ['two'] };
    const merged = dedupAdvisories([a, b]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].topLevelChains.slice().sort(), ['one', 'two']);
  });
});

describe('renderTable', () => {
  it('emits "0 advisories — clean" for empty input', () => {
    const out = renderTable([]);
    assert.match(out, /0 advisories — clean/);
  });

  it('emits a markdown table with the AC-10 column header', () => {
    const records = dedupAdvisories(parseAuditJson(loadFixture('npm-audit-mod-only.json')));
    const out = renderTable(records);
    assert.match(out, /\|\s*#\s*\|\s*Advisory\s*\|\s*Severity\s*\|\s*Vulnerable Package\s*\|\s*Range\s*\|\s*URL\s*\|/);
  });

  it('emits one row per advisory and numbers them sequentially', () => {
    const records = dedupAdvisories(parseAuditJson(loadFixture('npm-audit-mod-only.json')));
    const out = renderTable(records);
    const dataRows = out.split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l));
    assert.equal(dataRows.length, 2);
    assert.match(dataRows[0], /^\|\s*1\s*\|/);
    assert.match(dataRows[1], /^\|\s*2\s*\|/);
  });

  it('truncates top-level chains after 3 with "(+N more)"', () => {
    const records = dedupAdvisories(parseAuditJson(loadFixture('npm-audit-multipath.json')));
    const out = renderTable(records);
    // 5 chains → first 3 shown then "(+2 more)"
    assert.match(out, /\(\+2 more\)/);
  });

  it('includes the advisory URL in its own column', () => {
    const records = dedupAdvisories(parseAuditJson(loadFixture('npm-audit-high.json')));
    const out = renderTable(records);
    assert.match(out, /https:\/\/github\.com\/advisories\/GHSA-wf5p-g6vw-rhxx/);
  });
});

describe('hasBlockingSeverity', () => {
  it('returns true when any HIGH/CRITICAL is present (default mode)', () => {
    const records = dedupAdvisories(parseAuditJson(loadFixture('npm-audit-high.json')));
    assert.equal(hasBlockingSeverity(records, { strict: false }), true);
  });

  it('returns false when only MOD/LOW are present (default mode)', () => {
    const records = dedupAdvisories(parseAuditJson(loadFixture('npm-audit-mod-only.json')));
    assert.equal(hasBlockingSeverity(records, { strict: false }), false);
  });

  it('returns true for any severity under --strict', () => {
    const records = dedupAdvisories(parseAuditJson(loadFixture('npm-audit-mod-only.json')));
    assert.equal(hasBlockingSeverity(records, { strict: true }), true);
  });

  it('returns false on empty advisories regardless of strict flag', () => {
    assert.equal(hasBlockingSeverity([], { strict: false }), false);
    assert.equal(hasBlockingSeverity([], { strict: true }), false);
  });
});
