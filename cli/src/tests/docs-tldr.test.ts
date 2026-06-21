// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/docs-tldr.test.ts
// description: Tests for `conduit docs tldr --check / --apply`.
// owner:       BOTH
// update:      Manual when convention or budget changes.
// schema:      none
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDocs } from '../commands/docs.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: o\n  architect: a\n  security: s\n  compliance: c\n  specialist: sp\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: "${new Date().toISOString().slice(0, 10)}"\n\`\`\`\n`;

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-tldr-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  fs.mkdirSync(path.join(dir, 'convoys', 'active'), { recursive: true });
  return dir;
}

function captureLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  return { lines, restore: () => { console.log = orig; } };
}

const SAMPLE_WITH_HEADER = `<!--
# ── CONDUIT MANAGED FILE ────────────
# file: directives/sample.md
-->

# Sample Directive

Body content here.
`;

const SAMPLE_NO_HEADER = `# Sample Directive\n\nBody content.\n`;

describe('docs tldr --apply', () => {
  it('inserts a stub between managed-file comment and first heading', async () => {
    const repo = tmpRepo();
    const dir = path.join(repo, 'directives');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'sample.md');
    fs.writeFileSync(file, SAMPLE_WITH_HEADER, 'utf-8');

    const cap = captureLog();
    try { await runDocs(['tldr', '--apply', '--repo', repo]); }
    finally { cap.restore(); }

    const next = fs.readFileSync(file, 'utf-8');
    const headerIdx = next.indexOf('## TL;DR');
    const titleIdx = next.indexOf('# Sample Directive');
    assert.ok(headerIdx > 0, 'TL;DR header should exist');
    assert.ok(headerIdx < titleIdx, 'TL;DR should sit before the body title');
    assert.match(next, /TL;DR pending/);
  });

  it('inserts at top when no managed-file comment is present', async () => {
    const repo = tmpRepo();
    const dir = path.join(repo, 'directives');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'plain.md');
    fs.writeFileSync(file, SAMPLE_NO_HEADER, 'utf-8');

    const cap = captureLog();
    try { await runDocs(['tldr', '--apply', '--repo', repo]); }
    finally { cap.restore(); }

    const next = fs.readFileSync(file, 'utf-8');
    assert.ok(next.startsWith('## TL;DR'), `expected TL;DR at top, got: ${next.slice(0, 40)}`);
  });

  it('does not double-insert when TL;DR already exists', async () => {
    const repo = tmpRepo();
    const dir = path.join(repo, 'directives');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'has-tldr.md');
    fs.writeFileSync(file, '## TL;DR\n- existing summary\n\n# Body\n', 'utf-8');

    const cap = captureLog();
    try { await runDocs(['tldr', '--apply', '--repo', repo]); }
    finally { cap.restore(); }

    const next = fs.readFileSync(file, 'utf-8');
    const occurrences = next.split('## TL;DR').length - 1;
    assert.equal(occurrences, 1);
    assert.doesNotMatch(next, /TL;DR pending/);
  });
});

describe('docs tldr --check', () => {
  it('reports missing TL;DR per file', async () => {
    const repo = tmpRepo();
    // Give the fixture CONDUIT.md a TL;DR so the test only flags `a.md`.
    fs.writeFileSync(path.join(repo, 'CONDUIT.md'),
      '## TL;DR\n- root TL;DR.\n\n## Repo Signals\nfoo\n', 'utf-8');
    const dir = path.join(repo, 'directives');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.md'), '# A\n\nBody.\n', 'utf-8');
    fs.writeFileSync(path.join(dir, 'b.md'), '## TL;DR\n- short.\n\n# B\nBody.\n', 'utf-8');

    const cap = captureLog();
    try { await runDocs(['tldr', '--check', '--repo', repo]); }
    finally { cap.restore(); }

    const out = cap.lines.join('\n');
    assert.match(out, /Missing TL;DR \(1\)/);
    assert.match(out, /a\.md/);
    assert.doesNotMatch(out, /Stub placeholders.*\n.*b\.md/);
  });

  it('flags stub placeholder as still pending', async () => {
    const repo = tmpRepo();
    const dir = path.join(repo, 'directives');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'stub.md'),
      '## TL;DR\n_(TL;DR pending — replace with summary)_\n\n# Body\n', 'utf-8');

    const cap = captureLog();
    try { await runDocs(['tldr', '--check', '--repo', repo]); }
    finally { cap.restore(); }

    const out = cap.lines.join('\n');
    assert.match(out, /Stub placeholders/);
    assert.match(out, /stub\.md/);
  });

  it('flags over-budget TL;DR blocks', async () => {
    const repo = tmpRepo();
    const dir = path.join(repo, 'directives');
    fs.mkdirSync(dir, { recursive: true });
    // Build a TL;DR body well over 150 tokens (~600 chars).
    const big = 'word '.repeat(400);
    fs.writeFileSync(path.join(dir, 'big.md'), `## TL;DR\n${big}\n\n# Body\n`, 'utf-8');

    const cap = captureLog();
    try { await runDocs(['tldr', '--check', '--repo', repo]); }
    finally { cap.restore(); }

    const out = cap.lines.join('\n');
    assert.match(out, /Over budget/);
    assert.match(out, /big\.md/);
  });
});
