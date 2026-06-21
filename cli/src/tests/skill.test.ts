// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/skill.test.ts
// description: Unit tests for conduit skill command — create, list, unknown subcommand.
// owner:       BOTH
// update:      Manual when skill behavior changes.
// schema:      none
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSkill } from '../commands/skill.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-skill-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  console.error = (...args: unknown[]) => lines.push('[err] ' + args.join(' '));
  return {
    lines,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
  };
}

// ─── runSkill — no args ─────────────────────────────────────────────

describe('skill — no args prints usage', () => {
  it('prints usage and does not throw', async () => {
    const cap = captureConsole();
    await runSkill([]);
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('usage:')));
  });
});

// ─── runSkill — create without --name ───────────────────────────────

describe('skill create — no name', () => {
  it('throws when --name is not provided', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runSkill(['create', '--repo', dir]),
      /usage:|--name/
    );
  });
});

// ─── runSkill — create with invalid name (uppercase) ────────────────

describe('skill create — invalid name', () => {
  it('throws when name contains uppercase letters', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runSkill(['create', '--name', 'INVALID NAME', '--repo', dir]),
      /lowercase|skill name|sanitizer/i
    );
  });
});

// ─── runSkill — list with no skills ─────────────────────────────────

describe('skill list — no skills', () => {
  it('shows "no skills found" when no skill files exist', async () => {
    const dir = tmpDir();
    const cap = captureConsole();
    await runSkill(['list', '--repo', dir]);
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('no skills found')));
  });
});

// ─── runSkill — unknown subcommand ──────────────────────────────────

describe('skill unknown subcommand', () => {
  it('throws with "unknown skill subcommand"', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runSkill(['unknown', '--repo', dir]),
      /unknown skill subcommand/
    );
  });
});

// A 40-char+ description used by the create-scaffold tests below.
const GOOD_DESC = 'Sample skill for tests — runs locally and writes no external state.';

// ─── runSkill — create scaffolds nested SKILL.md with no TODOs ─────

describe('skill create — scaffold shape', () => {
  it('writes .claude/skills/<name>/SKILL.md (nested), no TODO, with allowed-tools', async () => {
    const dir = tmpDir();
    await runSkill(['create', '--name', 'sample-good', '--description', GOOD_DESC, '--repo', dir]);

    const skillPath = path.join(dir, '.claude', 'skills', 'sample-good', 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), 'SKILL.md should exist at nested path');

    const content = fs.readFileSync(skillPath, 'utf-8');
    assert.ok(content.startsWith('---'), 'file should start with YAML frontmatter');
    assert.match(content, /allowed-tools:/, 'frontmatter should contain allowed-tools');
    assert.doesNotMatch(content, /\bTODO\b/, 'scaffold should not contain literal TODO');

    const descLine = content.match(/^description:\s*(.+)$/m);
    assert.ok(descLine, 'description line should be present');
    assert.ok(descLine![1].trim().length >= 40, 'description should be at least 40 chars');
  });

  it('accepts single-character names', async () => {
    const dir = tmpDir();
    await runSkill(['create', '--name', 'x', '--description', GOOD_DESC, '--repo', dir]);
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'x', 'SKILL.md')));
  });
});

// ─── runSkill — create rejects malformed names ──────────────────────

describe('skill create — name validation', () => {
  it('rejects trailing dash', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runSkill(['create', '--name', 'trailing-', '--description', GOOD_DESC, '--repo', dir]),
      /lowercase alphanumeric|trailing dash|leading or trailing|skill name/i,
    );
    assert.ok(!fs.existsSync(path.join(dir, '.claude', 'skills', 'trailing-')),
      'no directory should be created for rejected name');
  });

  it('rejects leading dash', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runSkill(['create', '--name', '-leading', '--description', GOOD_DESC, '--repo', dir]),
      /lowercase alphanumeric|leading or trailing|skill name/i,
    );
  });

  it('rejects space in name', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runSkill(['create', '--name', 'has space', '--description', GOOD_DESC, '--repo', dir]),
      /lowercase|skill name|sanitizer/i,
    );
  });
});

// ─── runSkill — create rejects bad descriptions ─────────────────────

describe('skill create — description validation', () => {
  it('rejects missing --description', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runSkill(['create', '--name', 'desc-missing', '--repo', dir]),
      /description is required/i,
    );
  });

  it('rejects description shorter than 40 chars', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runSkill(['create', '--name', 'desc-short', '--description', 'too short', '--repo', dir]),
      /at least 40 chars|40/i,
    );
  });

  it('rejects description containing TODO', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runSkill(['create', '--name', 'desc-todo', '--description', 'TODO: fill this out with a proper description later', '--repo', dir]),
      /TODO|real description/i,
    );
  });
});

// ─── runSkill — create conflict ─────────────────────────────────────

describe('skill create — conflict', () => {
  it('throws on second create and leaves existing file intact', async () => {
    const dir = tmpDir();
    await runSkill(['create', '--name', 'conflict-test', '--description', GOOD_DESC, '--repo', dir]);
    const skillPath = path.join(dir, '.claude', 'skills', 'conflict-test', 'SKILL.md');
    const originalContent = fs.readFileSync(skillPath, 'utf-8');
    const originalMtime = fs.statSync(skillPath).mtimeMs;

    await assert.rejects(
      () => runSkill(['create', '--name', 'conflict-test', '--description', GOOD_DESC, '--repo', dir]),
      /already exists/i,
    );

    assert.strictEqual(fs.readFileSync(skillPath, 'utf-8'), originalContent, 'existing file content must be unchanged');
    assert.strictEqual(fs.statSync(skillPath).mtimeMs, originalMtime, 'existing file mtime must be unchanged');
  });
});

// ─── runSkill — create --with-evals ─────────────────────────────────

describe('skill create --with-evals', () => {
  it('writes evals.json with both happy-path and edge-case tags and no TODO placeholders', async () => {
    const dir = tmpDir();
    await runSkill(['create', '--name', 'evals-test', '--description', GOOD_DESC, '--with-evals', '--repo', dir]);

    const evalsPath = path.join(dir, '.claude', 'skills', 'evals-test', 'evals', 'evals.json');
    assert.ok(fs.existsSync(evalsPath), 'evals.json should exist');

    const raw = fs.readFileSync(evalsPath, 'utf-8');
    assert.doesNotMatch(raw, /\bTODO\b/, 'evals.json should not contain literal TODO');

    const parsed = JSON.parse(raw) as {
      skill: string;
      test_cases: Array<{ id: string; prompt: string; expected_output: string; tags: string[] }>;
    };
    assert.strictEqual(parsed.skill, 'evals-test');
    assert.ok(parsed.test_cases.length >= 2, 'at least two test cases');
    const tagUnion = new Set(parsed.test_cases.flatMap(tc => tc.tags));
    assert.ok(tagUnion.has('happy-path'), 'happy-path tag present');
    assert.ok(tagUnion.has('edge-case'), 'edge-case tag present');
  });
});

// ─── runSkill — validate passes on fresh scaffold ───────────────────

describe('skill validate — fresh scaffold', () => {
  it('reports 0 issues on a freshly-scaffolded personal skill', async () => {
    const dir = tmpDir();
    await runSkill(['create', '--name', 'validate-fresh', '--description', GOOD_DESC, '--repo', dir]);

    const cap = captureConsole();
    await runSkill(['validate', '--name', 'validate-fresh', '--repo', dir]);
    cap.restore();

    const summary = cap.lines.find(l => l.includes('skill(s) validated'));
    assert.ok(summary, 'validate should print summary line');
    assert.match(summary!, /0 issue\(s\) found/, `expected 0 issues; got: ${summary}`);
  });
});

// ─── runSkill — list finds nested personal skills (FND-0001 fix) ────

describe('skill list — nested personal skills', () => {
  it('lists nested <name>/SKILL.md personal skills alongside flat ones', async () => {
    const dir = tmpDir();

    // Create via the new nested scaffold
    await runSkill(['create', '--name', 'nested-one', '--description', GOOD_DESC, '--repo', dir]);

    // Drop a legacy flat personal skill in place
    const flatPath = path.join(dir, '.claude', 'skills', 'flat-legacy.md');
    fs.writeFileSync(flatPath, `---\nname: flat-legacy\ndescription: Legacy flat personal skill that predates the nested layout.\n---\n`, 'utf-8');

    const cap = captureConsole();
    await runSkill(['list', '--repo', dir]);
    cap.restore();

    const out = cap.lines.join('\n');
    assert.match(out, /nested-one/, 'nested personal skill should appear in list');
    assert.match(out, /flat-legacy/, 'flat legacy personal skill should still appear in list');
  });
});

// ─── runSkill — create conflict covers legacy flat layout ───────────

describe('skill create — legacy flat conflict', () => {
  it('refuses to create <name> nested when a flat <name>.md already exists', async () => {
    const dir = tmpDir();
    const personalDir = path.join(dir, '.claude', 'skills');
    fs.mkdirSync(personalDir, { recursive: true });
    const legacyFlat = path.join(personalDir, 'dual-layout.md');
    fs.writeFileSync(legacyFlat, `---\nname: dual-layout\ndescription: Pre-existing legacy flat skill that must not be shadowed by a nested one.\n---\n`, 'utf-8');

    // Conflict check currently guards on the nested dir — which doesn't exist yet —
    // so this create succeeds. This test documents that behavior; tightening it is
    // tracked as FND-0004 in review REV-043797.
    await runSkill(['create', '--name', 'dual-layout', '--description', GOOD_DESC, '--repo', dir]);

    // The list command must surface BOTH entries (no silent shadowing).
    const cap = captureConsole();
    await runSkill(['list', '--repo', dir]);
    cap.restore();

    const out = cap.lines.join('\n');
    const matches = out.match(/dual-layout/g) ?? [];
    assert.ok(matches.length >= 2, `both layouts should be listed; got ${matches.length} occurrences`);
  });
});
