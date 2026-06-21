// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/usage.test.ts
// description: Tests for `conduit usage record` and `conduit usage report`.
// owner:       BOTH
// update:      Manual when usage command behavior changes.
// schema:      convoys/schema/events.schema.json
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runUsage } from '../commands/usage.js';
import { readConvoyEvents } from '../internal/convoy-events.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: o\n  architect: a\n  security: s\n  compliance: c\n  specialist: sp\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: "${new Date().toISOString().slice(0, 10)}"\n\`\`\`\n`;

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-usage-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

function makeConvoy(repoDir: string, convoyId: string, stage: number): string {
  const convoyDir = path.join(repoDir, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'),
    `id: "${convoyId}"\nstage: ${stage}\nstatus: active\n`, 'utf-8');
  return convoyDir;
}

describe('usage record', () => {
  it('appends a model_usage event with the supplied fields', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'cnv-usage-001', 3);
    await runUsage(['record', '--stage', '3', '--model', 'claude-sonnet-4-6',
                    '--input', '12000', '--output', '3500', '--cache-read', '8000',
                    '--repo', repo]);
    const events = readConvoyEvents(path.join(repo, 'convoys', 'active', 'cnv-usage-001'));
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'model_usage');
    assert.equal(events[0].stage, 3);
    assert.equal(events[0].usage?.model, 'claude-sonnet-4-6');
    assert.equal(events[0].usage?.input_tokens, 12000);
    assert.equal(events[0].usage?.output_tokens, 3500);
    assert.equal(events[0].usage?.cache_read_tokens, 8000);
  });

  it('infers stage from convoy.yaml when --stage is omitted', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'cnv-usage-002', 5);
    await runUsage(['record', '--model', 'claude-opus-4-6', '--repo', repo]);
    const events = readConvoyEvents(path.join(repo, 'convoys', 'active', 'cnv-usage-002'));
    assert.equal(events.length, 1);
    assert.equal(events[0].stage, 5);
  });

  it('errors when multiple active convoys exist and --convoy is omitted', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'cnv-usage-003a', 1);
    makeConvoy(repo, 'cnv-usage-003b', 1);
    await assert.rejects(
      () => runUsage(['record', '--model', 'claude-sonnet-4-6', '--stage', '1', '--repo', repo]),
      /multiple active convoys/,
    );
  });

  it('attaches files_read with estimated tokens when --read-file is passed', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'cnv-usage-files', 3);
    // Create two readable files at known sizes.
    const f1 = path.join(repo, 'doc-a.md');
    const f2 = path.join(repo, 'doc-b.md');
    fs.writeFileSync(f1, 'a'.repeat(800), 'utf-8');  // ~200 tokens
    fs.writeFileSync(f2, 'b'.repeat(2000), 'utf-8'); // ~500 tokens
    await runUsage(['record', '--stage', '3', '--model', 'claude-sonnet-4-6',
                    '--read-file', 'doc-a.md',
                    '--read-file', f2,
                    '--repo', repo]);
    const events = readConvoyEvents(path.join(repo, 'convoys', 'active', 'cnv-usage-files'));
    assert.equal(events.length, 1);
    const files = events[0].usage?.files_read;
    assert.ok(files && files.length === 2, 'should record both files');
    const paths = files!.map(f => f.path).sort();
    assert.deepEqual(paths, ['doc-a.md', 'doc-b.md']);
    for (const f of files!) {
      assert.ok(f.est_tokens > 0, `${f.path} should have non-zero token estimate`);
    }
  });

  it('records on the named convoy when --convoy is supplied', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'cnv-usage-004a', 1);
    makeConvoy(repo, 'cnv-usage-004b', 4);
    await runUsage(['record', '--convoy', 'cnv-usage-004b', '--model', 'claude-sonnet-4-6',
                    '--stage', '4', '--repo', repo]);
    const aEvents = readConvoyEvents(path.join(repo, 'convoys', 'active', 'cnv-usage-004a'));
    const bEvents = readConvoyEvents(path.join(repo, 'convoys', 'active', 'cnv-usage-004b'));
    assert.equal(aEvents.length, 0);
    assert.equal(bEvents.length, 1);
    assert.equal(bEvents[0].stage, 4);
  });
});

describe('usage report', () => {
  it('prints empty-state guidance when no model_usage events exist', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'cnv-rpt-001', 2);
    const orig = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    try {
      await runUsage(['report', 'cnv-rpt-001', '--repo', repo]);
    } finally {
      console.log = orig;
    }
    const out = lines.join('\n');
    assert.match(out, /No model_usage events recorded yet/);
  });

  it('aggregates by stage and flags policy mismatch (Stage 5 requires opus)', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'cnv-rpt-002', 5);
    // Record a Stage 5 event with the WRONG model — Stage 5 requires opus.
    await runUsage(['record', '--stage', '5', '--model', 'claude-sonnet-4-6',
                    '--input', '5000', '--output', '1200', '--repo', repo]);
    const orig = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    try {
      await runUsage(['report', 'cnv-rpt-002', '--repo', repo]);
    } finally {
      console.log = orig;
    }
    const out = lines.join('\n');
    assert.match(out, /MISMATCH/);
    assert.match(out, /claude-opus-4-6/);
    assert.match(out, /1 mismatch/);
  });

  it('marks acceptable variants as OK (Stage 7 allows sonnet for high-impact comms)', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'cnv-rpt-003', 7);
    await runUsage(['record', '--stage', '7', '--model', 'claude-sonnet-4-6', '--repo', repo]);
    const orig = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    try {
      await runUsage(['report', 'cnv-rpt-003', '--repo', repo]);
    } finally {
      console.log = orig;
    }
    const out = lines.join('\n');
    assert.match(out, /all stages OK/);
  });

  it('emits valid JSON with --json', async () => {
    const repo = tmpRepo();
    makeConvoy(repo, 'cnv-rpt-004', 3);
    await runUsage(['record', '--stage', '3', '--model', 'claude-sonnet-4-6',
                    '--input', '1000', '--output', '500', '--repo', repo]);
    const orig = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    try {
      await runUsage(['report', 'cnv-rpt-004', '--json', '--repo', repo]);
    } finally {
      console.log = orig;
    }
    const out = lines.join('\n');
    const parsed = JSON.parse(out);
    assert.equal(parsed.convoy, 'cnv-rpt-004');
    assert.equal(parsed.stages.length, 1);
    assert.equal(parsed.stages[0].stage, 3);
    assert.equal(parsed.stages[0].models[0].model, 'claude-sonnet-4-6');
    assert.equal(parsed.stages[0].models[0].verdict.ok, true);
  });
});
