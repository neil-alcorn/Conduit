// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/headless-foundation.test.ts
// description: T-001 unit coverage for the headless foundation modules:
//              context-parser (JSON/YAML detection, schema validation),
//              headless-io (prompt() context-hit vs throw), headless-output
//              (envelope + JSON-lines events), and the index.ts `--headless`
//              arg plumbing (`--help` JSON, `--json` no-op alias) via
//              spawnSync against the built CLI. AC-3/9/10/13/14/16/18.
// owner:       BOTH
// update:      Manual when headless foundation contracts change.
// schema:      none
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseContextBlock, validateContext, InvalidContextError } from '../internal/context-parser.js';
import { setHeadless, isHeadless, setHeadlessContext, getHeadlessContext, prompt, MissingContextFieldError } from '../internal/headless-io.js';
import { headlessOutput, headlessEvent, headlessError } from '../internal/headless-output.js';

// Compiled location: dist/cli/src/tests → repo root is four levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CLI_ENTRY = path.join('dist', 'cli', 'src', 'index.js');

/** Capture a stream's writes while fn runs; returns everything written. */
async function captureStream(stream: NodeJS.WriteStream, fn: () => void | Promise<void>): Promise<string> {
  let out = '';
  const orig = stream.write.bind(stream);
  (stream as any).write = (chunk: any): boolean => {
    out += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  };
  try {
    await fn();
  } finally {
    (stream as any).write = orig;
  }
  return out;
}

describe('context-parser — parseContextBlock', () => {
  it('detects JSON when input starts with {', () => {
    const parsed = parseContextBlock('  {"convoy_id": "cnv-x", "title": "T"}');
    assert.deepEqual(parsed, { convoy_id: 'cnv-x', title: 'T' });
  });

  it('detects JSON when input starts with [', () => {
    const parsed = parseContextBlock('[1, 2, 3]');
    assert.deepEqual(parsed, [1, 2, 3]);
  });

  it('falls back to YAML by default', () => {
    const parsed = parseContextBlock('convoy_id: cnv-y\ntitle: hello world\n');
    assert.deepEqual(parsed, { convoy_id: 'cnv-y', title: 'hello world' });
  });

  it('throws InvalidContextError on malformed JSON, carrying the parser message', () => {
    assert.throws(
      () => parseContextBlock('{"convoy_id": '),
      (err: Error) => err instanceof InvalidContextError && (err as InvalidContextError).details.length > 0,
    );
  });

  it('throws InvalidContextError on malformed YAML', () => {
    assert.throws(
      () => parseContextBlock('foo: [unclosed\nbar: : :'),
      (err: Error) => err instanceof InvalidContextError,
    );
  });

  it('throws InvalidContextError on empty input', () => {
    assert.throws(() => parseContextBlock('   \n  '), InvalidContextError);
  });
});

describe('context-parser — validateContext', () => {
  it('returns the typed object when all required fields are present', () => {
    const parsed = parseContextBlock('convoy_id: cnv-z\nreason: ok\n');
    const ctx = validateContext(parsed, { required: ['convoy_id', 'reason'], command: 'plan' });
    assert.equal(ctx.convoy_id, 'cnv-z');
    assert.equal(ctx.reason, 'ok');
  });

  it('throws MissingContextFieldError naming the FIRST missing field', () => {
    assert.throws(
      () => validateContext({ reason: 'r' }, { required: ['convoy_id', 'title', 'reason'], command: 'plan' }),
      (err: Error) => err instanceof MissingContextFieldError && (err as MissingContextFieldError).field === 'convoy_id',
    );
  });

  it('throws InvalidContextError when parsed input is not an object mapping', () => {
    assert.throws(
      () => validateContext('just a string', { required: ['convoy_id'], command: 'qa' }),
      InvalidContextError,
    );
  });
});

describe('headless-io — singleton + prompt()', () => {
  afterEach(() => {
    setHeadless(false);
    setHeadlessContext({});
  });

  it('setHeadless/isHeadless round-trip', () => {
    assert.equal(isHeadless(), false);
    setHeadless(true);
    assert.equal(isHeadless(), true);
  });

  it('setHeadlessContext/getHeadlessContext round-trip', () => {
    setHeadlessContext({ title: 'stored' });
    assert.deepEqual(getHeadlessContext(), { title: 'stored' });
  });

  it('prompt() in headless mode resolves from the stashed context field', async () => {
    setHeadless(true);
    setHeadlessContext({ title: 'from context' });
    assert.equal(await prompt('title'), 'from context');
  });

  it('prompt() in headless mode matches normalized labels against context keys', async () => {
    setHeadless(true);
    setHeadlessContext({ convoy_id: 'cnv-norm' });
    assert.equal(await prompt('Convoy ID'), 'cnv-norm');
  });

  it('prompt() in headless mode falls back to the declared default before throwing', async () => {
    setHeadless(true);
    setHeadlessContext({});
    assert.equal(await prompt('depth', { default: 'standard' }), 'standard');
  });

  it('prompt() in headless mode throws MissingContextFieldError carrying the field name', async () => {
    setHeadless(true);
    setHeadlessContext({ other: 'x' });
    await assert.rejects(
      () => prompt('approver'),
      (err: Error) => err instanceof MissingContextFieldError && (err as MissingContextFieldError).field === 'approver',
    );
  });
});

describe('headless-output — envelope + events', () => {
  it('headlessOutput writes one JSON document with command/verdict/timestamp', async () => {
    let returned = '';
    const out = await captureStream(process.stdout, () => {
      returned = headlessOutput({ command: 'plan', convoy_id: 'cnv-a', verdict: 'SUCCESS', artifacts: ['plan.md'] });
    });
    const doc = JSON.parse(out);
    assert.equal(doc.command, 'plan');
    assert.equal(doc.convoy_id, 'cnv-a');
    assert.equal(doc.verdict, 'SUCCESS');
    assert.deepEqual(doc.artifacts, ['plan.md']);
    assert.match(doc.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Return value mirrors what was written (Wave-2 commands can log/persist it).
    assert.deepEqual(JSON.parse(returned), doc);
  });

  it('headlessEvent writes a single JSON line to stderr with event + timestamp', async () => {
    const out = await captureStream(process.stderr, () => {
      headlessEvent('wave_started', { wave: 1 });
    });
    const lines = out.split('\n').filter((l) => l.trim() !== '');
    assert.equal(lines.length, 1, 'expected exactly one stderr line');
    const evt = JSON.parse(lines[0]);
    assert.equal(evt.event, 'wave_started');
    assert.equal(evt.wave, 1);
    assert.match(evt.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('headlessError writes an error envelope with error + timestamp + extras', async () => {
    const out = await captureStream(process.stdout, () => {
      headlessError('missing-context-field', { field: 'convoy_id' });
    });
    const doc = JSON.parse(out);
    assert.equal(doc.error, 'missing-context-field');
    assert.equal(doc.field, 'convoy_id');
    assert.match(doc.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('index.ts — --headless arg plumbing (spawn of built CLI)', () => {
  const spawnEnv = { ...process.env, CONDUIT_AGENT_HOST: 'neutral' };

  it('--headless --help emits parseable JSON help and exits 0 (AC-18)', () => {
    const res = spawnSync('node', [CLI_ENTRY, '--headless', '--help'], {
      cwd: REPO_ROOT, encoding: 'utf-8', env: spawnEnv,
    });
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}; stderr: ${res.stderr}`);
    const doc = JSON.parse(res.stdout);
    assert.equal(doc.command, 'help');
    assert.ok(doc.commands && typeof doc.commands === 'object', 'missing commands object');
    assert.ok(doc.commands['plan'], 'help JSON must describe the plan command');
    assert.ok(doc.commands['gate'], 'help JSON must describe the gate command');
    // No ANSI escapes in headless output.
    assert.doesNotMatch(res.stdout, /\[/);
  });

  it('--headless with no command emits JSON help, not the human banner', () => {
    const res = spawnSync('node', [CLI_ENTRY, '--headless'], {
      cwd: REPO_ROOT, encoding: 'utf-8', env: spawnEnv,
    });
    assert.equal(res.status, 0);
    const doc = JSON.parse(res.stdout);
    assert.equal(doc.command, 'help');
    // No ASCII-art banner: the welcome banner draws its rule with U+2501;
    // the word CONDUIT legitimately appears inside command descriptions.
    assert.doesNotMatch(res.stdout, /━/);
  });

  it('--headless --json together is not an error — --json is a silent no-op alias (AC-16)', () => {
    const res = spawnSync('node', [CLI_ENTRY, '--headless', '--json', '--help'], {
      cwd: REPO_ROOT, encoding: 'utf-8', env: spawnEnv,
    });
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}; stderr: ${res.stderr}`);
    const doc = JSON.parse(res.stdout);
    assert.equal(doc.command, 'help');
  });

  it('interactive --help is unchanged — human banner, exit 0', () => {
    const res = spawnSync('node', [CLI_ENTRY, '--help'], {
      cwd: REPO_ROOT, encoding: 'utf-8', env: spawnEnv,
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Core Commands/);
    assert.throws(() => JSON.parse(res.stdout), 'interactive help must NOT be a JSON document');
  });
});
