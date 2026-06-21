// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/pre-gate-stage-checklist.test.ts
// description: End-to-end tests for `conduit pre-gate` directive checklist
//              execution (CLI-2). Exercises AC-5/AC-6/AC-8/AC-8a/AC-8b/AC-9
//              with real temp git repos so the diff-scope and audit-summary
//              checks fire against real file content.
// owner:       BOTH
// update:      Manual when pre-gate contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPreGate } from '../commands/pre-gate.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals
\`\`\`yaml
operational_status: ACTIVE
system_class: MODERN
escalation_contacts:
  owner: owner
  architect: architect
  security: security
  compliance: compliance
  specialist: specialist
audience_defaults:
  field_agent: 1
  customer: 1
  employee: 1
  vendor_partner: 1
highway_init_date: 2026-04-07
last_context_update: 2026-04-07
\`\`\`
`;

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}

/** Isolate `resolveConvoyRoot()` from any real conduit central path during a test.
 *  See plan.test.ts for rationale (followons item #7). */
function isolateConduitEnv(stubDir: string): { restore: () => void } {
  const savedHome = process.env.CONDUIT_HOME;
  const savedCfg = process.env.CONDUIT_CONFIG_PATH;
  const savedLegacy = process.env.CONDUIT_LEGACY_RESOLVE;
  process.env.CONDUIT_HOME = stubDir;
  process.env.CONDUIT_CONFIG_PATH = path.join(stubDir, '.no-such-config.json');
  delete process.env.CONDUIT_LEGACY_RESOLVE;
  return {
    restore: () => {
      if (savedHome === undefined) delete process.env.CONDUIT_HOME;
      else process.env.CONDUIT_HOME = savedHome;
      if (savedCfg === undefined) delete process.env.CONDUIT_CONFIG_PATH;
      else process.env.CONDUIT_CONFIG_PATH = savedCfg;
      if (savedLegacy === undefined) delete process.env.CONDUIT_LEGACY_RESOLVE;
      else process.env.CONDUIT_LEGACY_RESOLVE = savedLegacy;
    },
  };
}

interface PreGateFixture {
  base: string;
  repo: string;
  convoyId: string;
  cleanup: () => void;
}

function setupFixture(label: string, opts: {
  directive?: string;
  pkgScripts?: Record<string, string>;
  withGitRepo?: boolean;
} = {}): PreGateFixture {
  const withGit = opts.withGitRepo ?? true;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-pg-${label}-`));
  const repo = path.join(base, 'repo');
  const convoyId = 'cnv-pg-001';

  fs.mkdirSync(repo, { recursive: true });

  if (withGit) {
    git(repo, 'init -b master');
    git(repo, 'config user.email test@conduit.local');
    git(repo, 'config user.name conduit-test');
  }

  // CONDUIT.md so checkPermission passes
  fs.writeFileSync(path.join(repo, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');

  // Convoy structure
  const convoyDir = path.join(repo, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'),
    `id: "${convoyId}"\nstage: 3\nstatus: active\nwork_type: net-new\nbase_branch: master\n`, 'utf-8');
  fs.writeFileSync(path.join(convoyDir, 'living-spec.md'), '# living spec\n\nshort.\n', 'utf-8');
  const wsDir = path.join(convoyDir, 'workstreams', 'ws1');
  fs.mkdirSync(wsDir, { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'ACCEPTANCE.md'), '# AC\n', 'utf-8');
  fs.mkdirSync(path.join(convoyDir, 'audit'), { recursive: true });

  // Directive
  const dirSubdir = path.join(repo, 'directives', 'net-new', 'stages');
  fs.mkdirSync(dirSubdir, { recursive: true });
  const directiveBody = opts.directive ?? [
    '# Stage 3 — Implementation Directive (Net New)',
    '',
    '## Gate 3 Criteria (Pre-Gate Checklist)',
    '- [ ] **lint**: Linter passes',
    '- [ ] **console-log-audit**: No console.log statements left in production code paths',
    '- [ ] **commented-code-audit**: No commented-out code blocks left in the diff',
    '',
    '## Common Failure Modes',
    'Skip schema-first.',
  ].join('\n');
  fs.writeFileSync(path.join(dirSubdir, '03-implementation.md'), directiveBody, 'utf-8');

  // package.json — universal `build` and `tests` executors react based on scripts
  const scripts = opts.pkgScripts ?? { build: 'node -e ""', test: 'node -e ""' };
  fs.writeFileSync(path.join(repo, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '0.0.0', scripts }, null, 2), 'utf-8');

  if (withGit) {
    git(repo, 'add -A');
    git(repo, 'commit -m initial');
  }

  const cleanup = (): void => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  return { base, repo, convoyId, cleanup };
}

interface CapturedRun {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function captureRunPreGate(args: string[]): Promise<CapturedRun> {
  let stdout = '';
  let stderr = '';
  const origLog = console.log;
  const origErr = console.error;
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: any): boolean => {
    stdout += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  console.log = (...a: any[]) => { stdout += a.join(' ') + '\n'; };
  console.error = (...a: any[]) => { stderr += a.join(' ') + '\n'; };
  process.exitCode = 0;
  try {
    await runPreGate(args);
  } finally {
    process.stdout.write = origStdoutWrite;
    console.log = origLog;
    console.error = origErr;
  }
  const exitCode = process.exitCode ?? 0;
  process.exitCode = 0;
  return { stdout, stderr, exitCode };
}

describe('pre-gate — AC-9 backward-compat (universal-only)', () => {
  it('runs only the universal 5 when directive has no Gate N Criteria section', async () => {
    const fx = setupFixture('ac9-universal-only', {
      directive: '# Stage 3\n\n## Step 1\nDo work.\n',
    });
    try {
      const { exitCode, stdout } = await captureRunPreGate([fx.convoyId, 'gate-3', '--repo', fx.repo]);
      assert.equal(exitCode, 0);
      assert.match(stdout, /VERDICT: READY/);
      // Stage-specific declared checks should NOT appear because directive declares none.
      assert.equal(/console-log-audit/.test(stdout), false, 'expected no declared-only checks');
      // Universal checks should all appear.
      for (const id of ['build', 'tests', 'living-spec', 'acceptance', 'token-budget']) {
        assert.match(stdout, new RegExp(id));
      }
    } finally { fx.cleanup(); }
  });
});

describe('pre-gate — AC-5 row format', () => {
  it('emits [STATUS] label · detail rows for each check', async () => {
    const fx = setupFixture('ac5-row-format');
    try {
      const { stdout } = await captureRunPreGate([fx.convoyId, 'gate-3', '--repo', fx.repo]);
      // At least one PASS row must appear in [TOKEN] label · detail form.
      assert.match(stdout, /\[(PASS|FAIL|SKIP|WARN|ACCEPTED)\][^\n]+·/);
    } finally { fx.cleanup(); }
  });
});

describe('pre-gate — AC-6 Stage 3 console-log-audit', () => {
  it('FAILs and exits 1 when console.log appears in a non-test source file in the diff', async () => {
    const fx = setupFixture('ac6-console-log');
    try {
      // Branch off master and add a non-test source file with console.log.
      git(fx.repo, 'checkout -b feature/log');
      const srcRel = 'src/index.ts';
      fs.mkdirSync(path.join(fx.repo, 'src'), { recursive: true });
      fs.writeFileSync(path.join(fx.repo, srcRel), 'export function bad() { console.log("oops"); }\n', 'utf-8');
      git(fx.repo, 'add -A');
      git(fx.repo, 'commit -m "introduce console.log"');

      const { exitCode, stdout } = await captureRunPreGate([fx.convoyId, 'gate-3', '--repo', fx.repo]);
      assert.equal(exitCode, 1, `expected BLOCKED exit 1, got ${exitCode}`);
      assert.match(stdout, /VERDICT: BLOCKED/);
      assert.match(stdout, /console-log-audit/);
    } finally { fx.cleanup(); }
  });

  it('PASSes console-log-audit when no console.log in diff', async () => {
    const fx = setupFixture('ac6-console-clean');
    try {
      const { exitCode, stdout } = await captureRunPreGate([fx.convoyId, 'gate-3', '--repo', fx.repo]);
      assert.equal(exitCode, 0);
      assert.match(stdout, /VERDICT: READY/);
    } finally { fx.cleanup(); }
  });
});

describe('pre-gate — AC-6 commented-code-audit', () => {
  it('FAILs when commented-out code matching the regex appears in diff', async () => {
    const fx = setupFixture('ac6-commented-code');
    try {
      git(fx.repo, 'checkout -b feature/comment');
      fs.mkdirSync(path.join(fx.repo, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(fx.repo, 'src/util.ts'),
        ['export function f() {', '  // const x = 1;', '  return 0;', '}'].join('\n'),
        'utf-8',
      );
      git(fx.repo, 'add -A');
      git(fx.repo, 'commit -m "leave commented code"');

      const { exitCode, stdout } = await captureRunPreGate([fx.convoyId, 'gate-3', '--repo', fx.repo]);
      assert.equal(exitCode, 1);
      assert.match(stdout, /commented-code-audit/);
    } finally { fx.cleanup(); }
  });
});

describe('pre-gate — AC-8a --accept', () => {
  it('rewrites a FAIL into ACCEPTED with reason and exits 0', async () => {
    const fx = setupFixture('ac8a-accept');
    try {
      git(fx.repo, 'checkout -b feature/log2');
      fs.mkdirSync(path.join(fx.repo, 'src'), { recursive: true });
      fs.writeFileSync(path.join(fx.repo, 'src/cli-print.ts'), 'console.log("intentional");\n', 'utf-8');
      git(fx.repo, 'add -A');
      git(fx.repo, 'commit -m "intentional console.log in CLI"');

      const { exitCode, stdout } = await captureRunPreGate([
        fx.convoyId, 'gate-3',
        '--accept', 'console-log-audit:cli intentionally writes to stdout',
        '--repo', fx.repo,
      ]);
      assert.equal(exitCode, 0, `expected READY exit 0 after --accept, got ${exitCode}`);
      assert.match(stdout, /VERDICT: READY/);
      assert.match(stdout, /Accepted: console-log-audit/);

      // The result file must persist the ACCEPTED row + reason for the peer reviewer.
      const resultFile = path.join(fx.repo, 'convoys', 'active', fx.convoyId, 'audit', 'pre-gate-3-result.md');
      assert.ok(fs.existsSync(resultFile));
      const md = fs.readFileSync(resultFile, 'utf-8');
      assert.match(md, /ACCEPTED/);
      assert.match(md, /cli intentionally writes to stdout/);
    } finally { fx.cleanup(); }
  });
});

describe('pre-gate — AC-8b outside convoy context', () => {
  it('exits 2 with the exact error message when no convoy resolvable', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-pg-no-convoy-'));
    const env = isolateConduitEnv(tmp);
    try {
      // Provide CONDUIT.md so checkPermission passes, but NO convoys/active/.
      fs.writeFileSync(path.join(tmp, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
      const { exitCode, stderr } = await captureRunPreGate(['--repo', tmp]);
      assert.equal(exitCode, 2);
      assert.match(stderr, /not in a Conduit convoy context — run from the convoy's repo root/);
    } finally {
      env.restore();
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});

describe('pre-gate — AC-8a writes audit/pre-gate-N-result.md', () => {
  it('writes the markdown result file with every row regardless of verdict', async () => {
    const fx = setupFixture('ac8a-result-md');
    try {
      const { exitCode } = await captureRunPreGate([fx.convoyId, 'gate-3', '--repo', fx.repo]);
      assert.equal(exitCode, 0);
      const resultFile = path.join(fx.repo, 'convoys', 'active', fx.convoyId, 'audit', 'pre-gate-3-result.md');
      assert.ok(fs.existsSync(resultFile));
      const md = fs.readFileSync(resultFile, 'utf-8');
      assert.match(md, /Pre-Gate Result — Gate 3/);
      // Every universal id should appear as a row.
      for (const id of ['build', 'tests', 'living-spec', 'acceptance', 'token-budget', 'lint', 'console-log-audit', 'commented-code-audit']) {
        assert.match(md, new RegExp(`\`${id}\``));
      }
    } finally { fx.cleanup(); }
  });
});
