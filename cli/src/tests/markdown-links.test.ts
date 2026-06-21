// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/markdown-links.test.ts
// description: Pure-function tests for markdown link extraction + audit-tree
//              filtering used by `conduit gate request` discipline checks.
// owner:       BOTH
// update:      Manual when markdown-links contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { extractMarkdownLinks, filterAuditLinks } from '../internal/markdown-links.js';

describe('extractMarkdownLinks — inline form', () => {
  it('extracts a single inline link', () => {
    const out = extractMarkdownLinks('see [the spec](audit/gate-3-request.md) for details');
    assert.deepEqual(out, ['audit/gate-3-request.md']);
  });

  it('extracts multiple inline links', () => {
    const md = 'see [a](audit/a.md), [b](audit/b.md), and [c](audit/c.md)';
    const out = extractMarkdownLinks(md);
    assert.deepEqual(out.sort(), ['audit/a.md', 'audit/b.md', 'audit/c.md']);
  });

  it('strips URL fragments and query strings', () => {
    const out = extractMarkdownLinks('[x](audit/foo.md#section), [y](audit/bar.md?ref=1)');
    assert.deepEqual(out.sort(), ['audit/bar.md', 'audit/foo.md']);
  });

  it('preserves absolute URLs (caller filters them out)', () => {
    const out = extractMarkdownLinks('[external](https://example.com/x), [local](audit/x.md)');
    assert.ok(out.includes('https://example.com/x'));
    assert.ok(out.includes('audit/x.md'));
  });
});

describe('extractMarkdownLinks — reference-style', () => {
  it('extracts reference-style definitions', () => {
    const md = [
      'See [the spec][s] for details.',
      '',
      '[s]: audit/gate-3-request.md',
    ].join('\n');
    const out = extractMarkdownLinks(md);
    assert.ok(out.includes('audit/gate-3-request.md'));
  });

  it('finds reference-style defs regardless of position', () => {
    const md = [
      '[a]: audit/a.md',
      '',
      'See [refs][a] [refs][b].',
      '',
      '[b]: audit/b.md',
    ].join('\n');
    const out = extractMarkdownLinks(md);
    assert.ok(out.includes('audit/a.md'));
    assert.ok(out.includes('audit/b.md'));
  });
});

describe('extractMarkdownLinks — exclusion (links inside fenced/comment/code spans)', () => {
  it('strips fenced code blocks (triple backtick)', () => {
    const md = [
      'Real link: [r](audit/real.md)',
      '',
      '```',
      'fake link: [f](audit/fake.md)',
      '```',
    ].join('\n');
    const out = extractMarkdownLinks(md);
    assert.ok(out.includes('audit/real.md'));
    assert.ok(!out.includes('audit/fake.md'));
  });

  it('strips fenced code blocks (tilde delimited)', () => {
    const md = [
      'Real: [r](audit/real.md)',
      '~~~',
      '[f](audit/fake.md)',
      '~~~',
    ].join('\n');
    const out = extractMarkdownLinks(md);
    assert.ok(out.includes('audit/real.md'));
    assert.ok(!out.includes('audit/fake.md'));
  });

  it('strips HTML comments', () => {
    const md = [
      'Real: [r](audit/real.md)',
      '<!-- aside: [f](audit/fake.md) -->',
    ].join('\n');
    const out = extractMarkdownLinks(md);
    assert.ok(out.includes('audit/real.md'));
    assert.ok(!out.includes('audit/fake.md'));
  });

  it('strips single-backtick inline code spans', () => {
    const md = 'Real: [r](audit/real.md). The literal mention `[f](audit/fake.md)` is not a link.';
    const out = extractMarkdownLinks(md);
    assert.ok(out.includes('audit/real.md'));
    assert.ok(!out.includes('audit/fake.md'));
  });

  it('does not strip multi-line HTML comments mid-document', () => {
    const md = [
      'Real: [r](audit/real.md)',
      '<!--',
      '  inline note: [f](audit/fake.md)',
      '-->',
      'After: [a](audit/after.md)',
    ].join('\n');
    const out = extractMarkdownLinks(md);
    assert.ok(out.includes('audit/real.md'));
    assert.ok(out.includes('audit/after.md'));
    assert.ok(!out.includes('audit/fake.md'));
  });
});

describe('filterAuditLinks', () => {
  // Use forward-slash POSIX semantics, then normalize through path so the test
  // is stable across platforms.
  const repoRoot = path.resolve('/tmp/repo');
  const convoyAuditRoot = path.join(repoRoot, 'convoys', 'active', 'cnv-001', 'audit');
  const requestDir = convoyAuditRoot;

  it('keeps relative paths that resolve inside the audit tree', () => {
    const out = filterAuditLinks(['gate-3-request.md', 'qa-unit-results.md'], requestDir, convoyAuditRoot);
    const expected = [
      path.join(convoyAuditRoot, 'gate-3-request.md'),
      path.join(convoyAuditRoot, 'qa-unit-results.md'),
    ].sort();
    assert.deepEqual(out.slice().sort(), expected);
  });

  it('drops absolute URLs', () => {
    const out = filterAuditLinks(['https://example.com/x', 'http://internal/y'], requestDir, convoyAuditRoot);
    assert.deepEqual(out, []);
  });

  it('drops paths that resolve outside the audit tree', () => {
    const out = filterAuditLinks(['../../shared/notes.md', '../../../escape.md'], requestDir, convoyAuditRoot);
    assert.deepEqual(out, []);
  });

  it('drops anchor-only links', () => {
    // Anchor-only link is empty after fragment strip (handled by extractMarkdownLinks)
    // but defensively filterAuditLinks should also tolerate empty input.
    const out = filterAuditLinks(['', '#section'], requestDir, convoyAuditRoot);
    assert.deepEqual(out, []);
  });

  it('keeps deeply-nested audit paths', () => {
    const out = filterAuditLinks(['gate-3/sub/note.md'], requestDir, convoyAuditRoot);
    assert.deepEqual(out, [path.join(convoyAuditRoot, 'gate-3', 'sub', 'note.md')]);
  });
});
