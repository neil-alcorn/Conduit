// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/doc-budget.test.ts
// description: Tests for `conduit doc-budget` — markdown token audit.
// owner:       BOTH
// update:      Manual when budget thresholds or scan paths change.
// schema:      none
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDocBudget } from '../commands/doc-budget.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: o\n  architect: a\n  security: s\n  compliance: c\n  specialist: sp\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: "${new Date().toISOString().slice(0, 10)}"\n\`\`\`\n`;

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-docbud-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  // Make it `looksLikeConduitRepo`-shaped so resolveConvoyRoot trusts --repo.
  fs.mkdirSync(path.join(dir, 'convoys', 'active'), { recursive: true });
  return dir;
}

function captureLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  return { lines, restore: () => { console.log = orig; } };
}

describe('doc-budget', () => {
  it('flags files exceeding the directive budget', async () => {
    const repo = tmpRepo();
    const dir = path.join(repo, 'directives', 'shared');
    fs.mkdirSync(dir, { recursive: true });
    // ~3500 tokens worth (well over 3000 directive budget)
    fs.writeFileSync(path.join(dir, 'big.md'), 'x'.repeat(14000), 'utf-8');
    fs.writeFileSync(path.join(dir, 'small.md'), 'x'.repeat(400), 'utf-8');

    const cap = captureLog();
    try {
      await runDocBudget(['--repo', repo]);
    } finally {
      cap.restore();
    }
    const output = cap.lines.join('\n');
    assert.match(output, /\[OVER\][^\n]*directives\/shared\/big\.md/);
    assert.match(output, /\[OK\][^\n]*directives\/shared\/small\.md/);
  });

  it('--over-budget filters to violators only', async () => {
    const repo = tmpRepo();
    const dir = path.join(repo, 'directives');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'big.md'), 'x'.repeat(14000), 'utf-8');
    fs.writeFileSync(path.join(dir, 'small.md'), 'x'.repeat(400), 'utf-8');

    const cap = captureLog();
    try {
      await runDocBudget(['--repo', repo, '--over-budget']);
    } finally {
      cap.restore();
    }
    const output = cap.lines.join('\n');
    assert.match(output, /big\.md/);
    assert.doesNotMatch(output, /small\.md/);
  });

  it('--json emits structured payload', async () => {
    const repo = tmpRepo();
    const dir = path.join(repo, 'directives');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.md'), 'x'.repeat(800), 'utf-8');

    const cap = captureLog();
    try {
      await runDocBudget(['--repo', repo, '--json']);
    } finally {
      cap.restore();
    }
    const parsed = JSON.parse(cap.lines.join('\n')) as {
      total_files: number; entries: Array<{ path: string; tokens: number; overBudget: boolean }>;
    };
    assert.ok(parsed.total_files >= 1);
    const entry = parsed.entries.find(e => e.path.endsWith('a.md'));
    assert.ok(entry, 'expected a.md in entries');
    assert.equal(entry!.overBudget, false);
  });

  it('handles empty repo gracefully', async () => {
    const repo = tmpRepo();
    const cap = captureLog();
    try {
      await runDocBudget(['--repo', repo]);
    } finally {
      cap.restore();
    }
    const output = cap.lines.join('\n');
    // Will pick up CONDUIT.md (root-doc) which is small, so total_files >= 1.
    assert.match(output, /Doc Budget Audit/);
  });
});
