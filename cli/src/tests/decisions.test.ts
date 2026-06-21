// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/decisions.test.ts
// description: Tests for Decision Learning System — AC 6.11 coverage.
// owner:       BOTH
// update:      Manual when DecisionEntry schema or command behavior changes.
// schema:      none
// last_update: 2026-05-27
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendDecision, readDecisions, formatDecisions, type DecisionEntry } from '../internal/decisions.js';
import { runDecisions } from '../commands/decisions.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: "${new Date().toISOString().slice(0, 10)}"\n\`\`\`\n`;

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-dec-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

function makeConvoy(repoDir: string, convoyId: string): string {
  const convoyDir = path.join(repoDir, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'),
    `id: "${convoyId}"\ntitle: "Test"\nwork_type: "net-new"\nstage: 3\nstatus: active\n`,
    'utf-8');
  return convoyDir;
}

function sampleEntry(convoy = 'test-convoy'): DecisionEntry {
  return {
    ts: '2026-05-22T20:00:00.000Z',
    convoy,
    question: 'feature branch already exists — how to proceed?',
    reasoning: 'Branch may be from a prior incomplete run.',
    userResponse: 'r',
    action: "Reused existing branch 'feature/test-convoy'",
  };
}

let captured: string[] = [];
let originalLog: typeof console.log;
let originalError: typeof console.error;

function captureConsole(): void {
  captured = [];
  originalLog = console.log;
  originalError = console.error;
  console.log = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };
  console.error = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };
}

function restoreConsole(): string[] {
  console.log = originalLog;
  console.error = originalError;
  return captured;
}

// ── appendDecision ─────────────────────────────────────────────────────────

describe('appendDecision — AC 6.11.1', () => {
  it('writes a JSONL entry to decisions.log in the convoy dir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-dec-app-'));
    const entry = sampleEntry();
    appendDecision(dir, entry);

    const logPath = path.join(dir, 'decisions.log');
    assert.ok(fs.existsSync(logPath), 'decisions.log should exist after appendDecision');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 1, 'should write exactly one line');
    const parsed = JSON.parse(lines[0]) as DecisionEntry;
    assert.equal(parsed.question, entry.question);
    assert.equal(parsed.userResponse, entry.userResponse);
    assert.equal(parsed.action, entry.action);
    assert.equal(parsed.convoy, entry.convoy);
  });

  it('appends additional entries without overwriting existing ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-dec-app2-'));
    appendDecision(dir, sampleEntry());
    appendDecision(dir, { ...sampleEntry(), question: 'second question' });

    const lines = fs.readFileSync(path.join(dir, 'decisions.log'), 'utf-8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.equal((JSON.parse(lines[1]) as DecisionEntry).question, 'second question');
  });
});

describe('appendDecision write failure — AC 6.11.5', () => {
  it('prints the entry to stderr and does not throw when write fails', () => {
    const badDir = path.join(os.tmpdir(), 'conduit-dec-nonexistent-' + Date.now(), 'sub');
    // badDir's parent doesn't exist — writeFileSync/appendFileSync will throw ENOENT
    const entry = sampleEntry();
    captureConsole();
    assert.doesNotThrow(() => appendDecision(badDir, entry));
    const output = restoreConsole();
    const joined = output.join('\n');
    assert.ok(joined.includes('failed to write decisions.log'), 'should report write failure');
    assert.ok(joined.includes(entry.question), 'should print the entry to stdout for manual recording');
  });
});

// ── readDecisions ──────────────────────────────────────────────────────────

describe('readDecisions — AC 6.11.6 / 6.11.2', () => {
  it('returns empty array when decisions.log does not exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-dec-rd-'));
    const entries = readDecisions(dir);
    assert.deepEqual(entries, []);
  });

  it('reads and parses all entries from decisions.log', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-dec-rd2-'));
    const e1 = sampleEntry();
    const e2 = { ...sampleEntry(), question: 'another question', ts: '2026-05-22T21:00:00.000Z' };
    fs.writeFileSync(path.join(dir, 'decisions.log'),
      JSON.stringify(e1) + '\n' + JSON.stringify(e2) + '\n', 'utf-8');

    const entries = readDecisions(dir);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].question, e1.question);
    assert.equal(entries[1].question, 'another question');
  });

  it('skips corrupt JSONL lines and returns the valid ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-dec-corrupt-'));
    const e1 = sampleEntry();
    fs.writeFileSync(path.join(dir, 'decisions.log'),
      JSON.stringify(e1) + '\nNOT_JSON\n', 'utf-8');

    captureConsole();
    const entries = readDecisions(dir);
    restoreConsole();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].question, e1.question);
  });
});

// ── formatDecisions ────────────────────────────────────────────────────────

describe('formatDecisions — AC 6.11.2', () => {
  it('returns empty string for empty entries array', () => {
    assert.equal(formatDecisions([]), '');
  });

  it('formats each entry with timestamp, convoy, Q, reasoning, response, action', () => {
    const entry = sampleEntry('my-convoy');
    const output = formatDecisions([entry]);
    assert.ok(output.includes('my-convoy'), 'should include convoy name');
    assert.ok(output.includes(entry.question), 'should include question');
    assert.ok(output.includes(entry.reasoning), 'should include reasoning');
    assert.ok(output.includes(entry.userResponse), 'should include user response');
    assert.ok(output.includes(entry.action), 'should include action taken');
  });
});

// ── runDecisions command — AC 6.11.6, 6.11.7, 6.11.2, 6.11.3 ──────────────

describe('runDecisions <convoy-id> — AC 6.11.6', () => {
  it('prints "No decisions logged" when no decisions.log exists for the convoy', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'my-convoy');

    captureConsole();
    await runDecisions(['my-convoy', '--repo', repo]);
    const output = restoreConsole();
    assert.ok(output.join('\n').includes("No decisions logged for convoy 'my-convoy'"));
  });

  it('prints formatted entries when decisions.log exists — AC 6.11.2', async () => {
    const repo = tmpRepo();
    const convoyDir = makeConvoy(repo, 'my-convoy');
    appendDecision(convoyDir, sampleEntry('my-convoy'));

    captureConsole();
    await runDecisions(['my-convoy', '--repo', repo]);
    const output = restoreConsole();
    const joined = output.join('\n');
    assert.ok(joined.includes('my-convoy'));
    assert.ok(joined.includes(sampleEntry().question));
  });

  it('throws when convoy-id is not found in active or archive', async () => {
    const repo = tmpRepo();
    await assert.rejects(
      () => runDecisions(['nonexistent-convoy', '--repo', repo]),
      /nonexistent-convoy.*not found/,
    );
  });
});

describe('runDecisions --all — AC 6.11.7', () => {
  it('prints "No decisions logged across any active convoy" when no decisions.log files exist', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'convoy-a');
    makeConvoy(repo, 'convoy-b');

    captureConsole();
    await runDecisions(['--all', '--repo', repo]);
    const output = restoreConsole();
    assert.ok(output.join('\n').includes('No decisions logged across any active convoy'));
  });

  it('prints "No decisions logged" when convoys/active dir does not exist', async () => {
    const repo = tmpRepo();

    captureConsole();
    await runDecisions(['--all', '--repo', repo]);
    const output = restoreConsole();
    assert.ok(output.join('\n').includes('No decisions logged across any active convoy'));
  });

  it('aggregates and sorts entries from multiple convoys — AC 6.11.3', async () => {
    const repo = tmpRepo();
    const dirA = makeConvoy(repo, 'convoy-a');
    const dirB = makeConvoy(repo, 'convoy-b');

    const earlier: DecisionEntry = { ...sampleEntry('convoy-a'), ts: '2026-05-22T10:00:00.000Z', question: 'earlier question' };
    const later: DecisionEntry = { ...sampleEntry('convoy-b'), ts: '2026-05-22T12:00:00.000Z', question: 'later question' };
    appendDecision(dirA, earlier);
    appendDecision(dirB, later);

    captureConsole();
    await runDecisions(['--all', '--repo', repo]);
    const output = restoreConsole().join('\n');
    const earlierIdx = output.indexOf('earlier question');
    const laterIdx = output.indexOf('later question');
    assert.ok(earlierIdx < laterIdx, 'entries should be sorted by timestamp ascending');
  });
});

describe('directives/shared/decision-learning.md — AC 6.11.4', () => {
  it('exists in the conduit repo', () => {
    const repoRoot = path.resolve(process.cwd());
    const dlPath = path.join(repoRoot, 'directives', 'shared', 'decision-learning.md');
    assert.ok(fs.existsSync(dlPath), 'directives/shared/decision-learning.md must exist');
  });

  it('documents when and how to apply the Decision Learning pattern', () => {
    const repoRoot = path.resolve(process.cwd());
    const dlPath = path.join(repoRoot, 'directives', 'shared', 'decision-learning.md');
    const content = fs.readFileSync(dlPath, 'utf-8');
    assert.ok(content.length > 100, 'decision-learning.md should have substantive content');
    assert.ok(content.toLowerCase().includes('decision'), 'should document the decision concept');
  });
});
