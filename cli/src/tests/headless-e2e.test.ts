// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/headless-e2e.test.ts
// description: T-009 end-to-end headless matrix — spawnSync of the built CLI
//              against throwaway fixture repos. Covers: happy path per
//              command (plan/execute/review/qa/gate eval), CONTEXT input in
//              both YAML and JSON, missing-field exit 3, malformed/empty
//              CONTEXT exit 3, not-initialized exit 4, the gate-mutation
//              refusal trio exit 2 with zero state mutation, gate eval
//              SEND_BACK exit 10, and stdout/stderr stream purity (AC-1..10,
//              13, 15). `--help --headless` JSON (AC-18) and the `--json`
//              alias (AC-16) live in headless-foundation.test.ts. The
//              pre-gate happy path is exercised for real in T-011 against
//              this repo (it runs the full build+test universal checks —
//              too slow for a fixture); its exit-4 path IS covered here.
// owner:       BOTH
// update:      Manual when the headless E2E contract changes.
// schema:      none
// last_update: 2026-06-11
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { spawnSync, execSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setHeadless } from '../internal/headless-io.js';
import { resolveHeadlessIdentity, gitSync, scrubCredentials } from '../internal/git-sync.js';

// Compiled location: dist/cli/src/tests → repo root is four levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'dist', 'cli', 'src', 'index.js');

const CONVOY_ID = 'cnv-e2e-001';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-06-11\n\`\`\`\n`;

/** Build a minimal non-git Conduit fixture with one active convoy at stage 3. */
function makeFixture(label: string): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-e2e-${label}-`));
  fs.writeFileSync(path.join(base, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  const convoyDir = path.join(base, 'convoys', 'active', CONVOY_ID);
  fs.mkdirSync(convoyDir, { recursive: true });
  fs.writeFileSync(
    path.join(base, 'convoys', 'registry.yaml'),
    'convoys:\n  active: []\n  archived: []\n',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(convoyDir, 'convoy.yaml'),
    `id: "${CONVOY_ID}"\nstage: 3\nstatus: active\nwork_type: enhancement\n`,
    'utf-8',
  );
  fs.writeFileSync(path.join(convoyDir, 'living-spec.md'), `# ${CONVOY_ID}\nseed\n`, 'utf-8');
  return base;
}

/** Spawn the built CLI in headless mode with a CONTEXT block on stdin.
 *  HOME/USERPROFILE point at the fixture and CONDUIT_HOME is cleared so a
 *  developer's ~/.conduit/config.json can never redirect resolution to a
 *  real repo — the fixture (or its absence) is the whole world. */
function runHeadless(cwd: string, cliArgs: string[], context: string): SpawnSyncReturns<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CONDUIT_AGENT_HOST: 'neutral',
    HOME: cwd,
    USERPROFILE: cwd,
  };
  delete env.CONDUIT_HOME;
  // CI identity vars would change commit attribution paths — strip for determinism.
  delete env.GITHUB_ACTOR;
  delete env.BUILD_REQUESTEDFOR;
  delete env.BUILD_SOURCEVERSIONAUTHOR;
  return spawnSync('node', [CLI_ENTRY, '--headless', ...cliArgs], {
    cwd,
    input: context,
    encoding: 'utf-8',
    timeout: 60000,
  });
}

/** Assert stdout is exactly one parseable JSON document and return it. */
function parseSingleDoc(stdout: string): any {
  assert.ok(stdout.trim().length > 0, 'expected a stdout JSON document, got nothing');
  let doc: any;
  assert.doesNotThrow(() => { doc = JSON.parse(stdout); },
    `stdout must be ONE JSON document, got:\n${stdout}`);
  return doc;
}

/** Assert every non-empty stderr line is a parseable JSON object (AC-10). */
function assertStderrJsonLines(stderr: string): void {
  for (const line of stderr.split('\n')) {
    if (line.trim() === '') continue;
    assert.doesNotThrow(() => JSON.parse(line),
      `stderr must be JSON-lines only, got plain text line:\n${line}`);
  }
}

describe('headless E2E — happy path per command (AC-1/2/9/10)', () => {
  let fx: string;
  before(() => { fx = makeFixture('happy'); });
  after(() => { fs.rmSync(fx, { recursive: true, force: true }); });

  const YAML_CTX = `convoy_id: ${CONVOY_ID}\n`;

  for (const [label, args, expectCommand] of [
    ['plan show', ['plan', 'show'], 'plan'],
    ['execute status', ['execute', 'status'], 'execute'],
    ['review show', ['review', 'show'], 'review'],
    ['qa status', ['qa', 'status'], 'qa'],
  ] as Array<[string, string[], string]>) {
    it(`${label}: exit 0, single SUCCESS envelope, JSON-lines stderr`, () => {
      const res = runHeadless(fx, args, YAML_CTX);
      assert.equal(res.status, 0, `expected exit 0, got ${res.status}; stderr:\n${res.stderr}`);
      const doc = parseSingleDoc(res.stdout);
      assert.equal(doc.command, expectCommand);
      assert.equal(doc.convoy_id, CONVOY_ID);
      assert.equal(doc.verdict, 'SUCCESS');
      assert.ok(Array.isArray(doc.artifacts), 'envelope must carry artifacts[]');
      assert.match(doc.timestamp, /^\d{4}-\d{2}-\d{2}T/);
      assertStderrJsonLines(res.stderr);
    });
  }

  it('gate eval: allowed in headless — JSON report, verdict SUCCESS, exit 0 (AC-7)', () => {
    const res = runHeadless(fx, ['gate', 'eval', CONVOY_ID, 'gate-3'], '');
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}; stderr:\n${res.stderr}`);
    const doc = parseSingleDoc(res.stdout);
    assert.equal(doc.command, 'gate eval');
    assert.equal(doc.verdict, 'SUCCESS');
    assert.equal(doc.stage, 3);
    assert.deepEqual(doc.checkpoints, { passed: 0, failed: 0, pending: 0 });
    assertStderrJsonLines(res.stderr);
  });

  it('CONTEXT block is accepted as JSON too (AC-1 format detection)', () => {
    const res = runHeadless(fx, ['plan', 'show'], `{"convoy_id": "${CONVOY_ID}"}`);
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}; stderr:\n${res.stderr}`);
    assert.equal(parseSingleDoc(res.stdout).convoy_id, CONVOY_ID);
  });
});

describe('headless E2E — validation errors (AC-3/13)', () => {
  let fx: string;
  before(() => { fx = makeFixture('errors'); });
  after(() => { fs.rmSync(fx, { recursive: true, force: true }); });

  it('missing required field: exit 3, JSON names the field', () => {
    const res = runHeadless(fx, ['plan', 'show'], 'foo: bar\n');
    assert.equal(res.status, 3, `expected exit 3, got ${res.status}; stdout:\n${res.stdout}`);
    const doc = parseSingleDoc(res.stdout);
    assert.equal(doc.error, 'missing-context-field');
    assert.equal(doc.field, 'convoy_id');
  });

  it('malformed CONTEXT: exit 3 with invalid-context + parser details', () => {
    const res = runHeadless(fx, ['review', 'show'], '{"convoy_id": ');
    assert.equal(res.status, 3, `expected exit 3, got ${res.status}; stdout:\n${res.stdout}`);
    const doc = parseSingleDoc(res.stdout);
    assert.equal(doc.error, 'invalid-context');
    assert.ok(String(doc.details).length > 0, 'invalid-context must carry parser details');
  });

  it('empty stdin: exit 3 invalid-context (no interactive fallback)', () => {
    const res = runHeadless(fx, ['execute', 'status'], '');
    assert.equal(res.status, 3, `expected exit 3, got ${res.status}; stdout:\n${res.stdout}`);
    assert.equal(parseSingleDoc(res.stdout).error, 'invalid-context');
  });
});

describe('headless E2E — not Conduit-initialized (AC-15)', () => {
  let emptyDir: string;
  before(() => { emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-e2e-empty-')); });
  after(() => { fs.rmSync(emptyDir, { recursive: true, force: true }); });

  it('plan show in a bare directory: exit 4 not-conduit-initialized', () => {
    const res = runHeadless(emptyDir, ['plan', 'show'], `convoy_id: ${CONVOY_ID}\n`);
    assert.equal(res.status, 4, `expected exit 4, got ${res.status}; stdout:\n${res.stdout}`);
    assert.equal(parseSingleDoc(res.stdout).error, 'not-conduit-initialized');
  });

  it('pre-gate in a bare directory: exit 4 not-conduit-initialized', () => {
    const res = runHeadless(emptyDir, ['pre-gate'], `convoy_id: ${CONVOY_ID}\n`);
    assert.equal(res.status, 4, `expected exit 4, got ${res.status}; stdout:\n${res.stdout}`);
    assert.equal(parseSingleDoc(res.stdout).error, 'not-conduit-initialized');
  });
});

describe('headless E2E — gate mutation refusal trio (AC-5, zero mutation)', () => {
  let fx: string;
  before(() => { fx = makeFixture('refusal'); });
  after(() => { fs.rmSync(fx, { recursive: true, force: true }); });

  for (const sub of ['approve', 'reject', 'skip']) {
    it(`gate ${sub}: exit 2, gate-mutation-refused JSON, no state touched`, () => {
      const yamlPath = path.join(fx, 'convoys', 'active', CONVOY_ID, 'convoy.yaml');
      const eventsPath = path.join(fx, 'convoys', 'active', CONVOY_ID, 'events.jsonl');
      const yamlBefore = fs.readFileSync(yamlPath, 'utf-8');

      const res = runHeadless(fx, ['gate', sub, CONVOY_ID, 'gate-3'], '');
      assert.equal(res.status, 2, `expected exit 2, got ${res.status}; stdout:\n${res.stdout}`);
      const doc = parseSingleDoc(res.stdout);
      assert.equal(doc.error, 'gate-mutation-refused');
      assert.equal(doc.message, 'Gate approvals are human-only; headless mode can only request gates');

      // Zero mutation: convoy.yaml byte-identical, no events.jsonl created.
      assert.equal(fs.readFileSync(yamlPath, 'utf-8'), yamlBefore, 'convoy.yaml must be untouched');
      assert.equal(fs.existsSync(eventsPath), false, 'no events.jsonl may be written by a refused mutation');
    });
  }
});

describe('headless E2E — gate eval SEND_BACK → exit 10 (AC-8)', () => {
  let fx: string;
  before(() => {
    fx = makeFixture('sendback');
    // Seed a FAILED checkpoint for the convoy — the deterministic CLI slice
    // of gate evaluation turns any failed checkpoint into SEND_BACK.
    const ckptDir = path.join(fx, '.conduit');
    fs.mkdirSync(ckptDir, { recursive: true });
    fs.writeFileSync(
      path.join(ckptDir, 'checkpoints.jsonl'),
      JSON.stringify({
        id: 'CHK-E2E-1', workstream_id: CONVOY_ID, stage: 3, title: 'failing check',
        status: 'failed', agent_role: 'qa', acceptance_criteria: [],
      }) + '\n',
      'utf-8',
    );
  });
  after(() => { fs.rmSync(fx, { recursive: true, force: true }); });

  it('failed checkpoint → verdict SEND_BACK, exit 10, counts in envelope', () => {
    const res = runHeadless(fx, ['gate', 'eval', CONVOY_ID, 'gate-3'], '');
    assert.equal(res.status, 10, `expected exit 10, got ${res.status}; stdout:\n${res.stdout}`);
    const doc = parseSingleDoc(res.stdout);
    assert.equal(doc.command, 'gate eval');
    assert.equal(doc.verdict, 'SEND_BACK');
    assert.equal(doc.checkpoints.failed, 1);
    assertStderrJsonLines(res.stderr);
  });
});

describe('headless E2E — allowed gate subcommands + internal errors (AC-6/AC-14)', () => {
  let fx: string;
  before(() => { fx = makeFixture('allowed'); });
  after(() => { fs.rmSync(fx, { recursive: true, force: true }); });

  it('gate request is NOT refused in headless — guard intercepts only approve/reject/skip (AC-6)', () => {
    // Without --request the command must NOT fall into the interactive
    // body prompt (found by this test: at stdin EOF node exited 0 with no
    // output — a silent CI no-op). Headless maps the missing file to the
    // exit-3 missing-field document; crucially it got PAST the mutation
    // guard: neither exit 2 nor gate-mutation-refused may appear.
    const res = runHeadless(fx, ['gate', 'request', CONVOY_ID, 'gate-3'], '');
    assert.equal(res.status, 3, `expected exit 3 (missing request file), got ${res.status}; stdout:\n${res.stdout}`);
    const doc = parseSingleDoc(res.stdout);
    assert.equal(doc.error, 'missing-context-field');
    assert.equal(doc.field, 'request');
  });

  it('unexpected exception → exit 1, internal error envelope, no stack trace on stdout (AC-14)', () => {
    // A convoy id that does not exist throws a plain Error deep in the
    // command body — the headless catch must map it to the internal document.
    const res = runHeadless(fx, ['plan', 'show'], 'convoy_id: does-not-exist\n');
    assert.equal(res.status, 1, `expected exit 1, got ${res.status}; stdout:\n${res.stdout}`);
    const doc = parseSingleDoc(res.stdout);
    assert.equal(doc.error, 'internal');
    assert.ok(typeof doc.exception === 'string' && doc.exception.length > 0, 'internal doc carries exception class');
    assert.doesNotMatch(res.stdout, /\n\s+at /, 'no stack trace may reach stdout');
  });
});

describe('headless-protocol directive content (AC-11/AC-12)', () => {
  it('documents CONTEXT shape, output contract, exit matrix, refusal rule, pending_question', () => {
    const directive = fs.readFileSync(
      path.join(REPO_ROOT, 'directives', 'shared', 'headless-protocol.md'), 'utf-8');
    for (const marker of [
      '## TL;DR',
      'CONTEXT Block',          // (a) input contract per command
      'Output Contract',        // (b) stdout envelope + stderr JSON-lines
      'Exit-Code Matrix',       // (c)
      'gate-mutation-refused',  // (d) refusal rule
      'pending_question',       // (e) AC-12 agent rule
      'Commit Attribution',     // (f)
    ]) {
      assert.ok(directive.includes(marker), `directive must document: ${marker}`);
    }
    for (const code of ['| 0 |', '| 1 |', '| 2 |', '| 3 |', '| 4 |', '| 10 |']) {
      assert.ok(directive.includes(code), `exit-code matrix must include row ${code}`);
    }
  });
});

describe('headless commit attribution (AC-4/AC-17)', () => {
  const CI_VARS = ['GITHUB_ACTOR'];
  const saved: Record<string, string | undefined> = {};

  before(() => {
    for (const v of CI_VARS) { saved[v] = process.env[v]; delete process.env[v]; }
  });
  after(() => {
    for (const v of CI_VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
    setHeadless(false);
  });

  it('no CI env vars → conduit-headless@local fallback (AC-17)', () => {
    const id = resolveHeadlessIdentity();
    assert.equal(id.name, 'conduit-headless');
    assert.equal(id.email, 'conduit-headless@local');
  });

  it('GITHUB_ACTOR sets the headless commit identity', () => {
    process.env.GITHUB_ACTOR = 'octo-ci';
    try {
      const id = resolveHeadlessIdentity();
      assert.equal(id.name, 'octo-ci');
      assert.equal(id.email, 'octo-ci@users.noreply.github.com');
    } finally {
      delete process.env.GITHUB_ACTOR;
    }
  });

  it('headless gitSync commit carries the conduit (headless): prefix + CI author (AC-4)', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-e2e-attr-'));
    try {
      const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: repo, stdio: 'pipe' }).toString().trim();
      git('init -b master');
      git('config user.email interactive@test.example');
      git('config user.name interactive-test');
      fs.writeFileSync(path.join(repo, 'state.txt'), 'v1', 'utf-8');
      git('add -A');
      git('commit -m seed');

      fs.writeFileSync(path.join(repo, 'state.txt'), 'v2', 'utf-8');
      setHeadless(true);
      try {
        gitSync(repo, ['state.txt'], 'conduit: state change', { push: false });
      } finally {
        setHeadless(false);
      }

      assert.equal(git('log -1 --format=%s'), 'conduit (headless): conduit: state change');
      assert.equal(git('log -1 --format=%an'), 'conduit-headless');
      assert.equal(git('log -1 --format=%ae'), 'conduit-headless@local');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('Stage-5 security hardening (SEC-M1/M2/M3)', () => {
  let fx: string;
  before(() => { fx = makeFixture('sec'); });
  after(() => { fs.rmSync(fx, { recursive: true, force: true }); });

  it('SEC-M1: scrubCredentials strips embedded tokens from git URLs', () => {
    assert.equal(
      scrubCredentials('failed to push to https://alice:hmb_live_secret@dev.azure.com/org/repo'),
      'failed to push to https://***@dev.azure.com/org/repo',
    );
    assert.equal(
      scrubCredentials('fetch http://token@host/x and https://plain.example.com/y'),
      'fetch http://***@host/x and https://plain.example.com/y',
    );
    // No credentials → untouched.
    assert.equal(scrubCredentials('error: src refspec master does not match any'),
      'error: src refspec master does not match any');
  });

  it('SEC-M2: traversal convoy_id in CONTEXT → exit 3 invalid-context', () => {
    const res = runHeadless(fx, ['plan', 'show'], 'convoy_id: ../../evil\n');
    assert.equal(res.status, 3, `expected exit 3, got ${res.status}; stdout:\n${res.stdout}`);
    const doc = parseSingleDoc(res.stdout);
    assert.equal(doc.error, 'invalid-context');
    assert.match(String(doc.details), /single path segment/);
  });

  it('SEC-M2: bare ".." convoy_id is rejected too', () => {
    const res = runHeadless(fx, ['plan', 'show'], 'convoy_id: ".."\n');
    assert.equal(res.status, 3, `expected exit 3, got ${res.status}; stdout:\n${res.stdout}`);
    assert.equal(parseSingleDoc(res.stdout).error, 'invalid-context');
  });

  it('SEC-M3: oversized CONTEXT block → exit 3 invalid-context, no OOM', () => {
    // 2 MB of YAML comment padding after a valid field — must be refused at
    // the 1 MB cap before parsing.
    const big = `convoy_id: ${CONVOY_ID}\n` + '# pad\n'.repeat(350_000);
    const res = runHeadless(fx, ['plan', 'show'], big);
    assert.equal(res.status, 3, `expected exit 3, got ${res.status}; stdout:\n${res.stdout}`);
    const doc = parseSingleDoc(res.stdout);
    assert.equal(doc.error, 'invalid-context');
    assert.match(String(doc.details), /exceeds/);
  });
});
