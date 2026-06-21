// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/exec-error-prefix.test.ts
// description: AC-9a end-to-end coverage — when a directive-declared check
//              executor throws, pre-gate emits the result row with the
//              `EXEC-ERROR:` prefix in BOTH stdout and the audit/pre-gate-N-
//              result.md markdown table. Closes the AC-9a Stage 4 PARTIAL.
// owner:       BOTH
// update:      Manual when EXEC-ERROR rendering changes.
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
import { EXECUTORS } from '../internal/pre-gate-checks.js';

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

function setupConvoyWithThrowingCheck(label: string): { repo: string; convoyId: string; cleanup: () => void } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-execerr-${label}-`));
  const repo = path.join(base, 'repo');
  const convoyId = 'cnv-execerr-001';
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init -b master');
  git(repo, 'config user.email test@conduit.local');
  git(repo, 'config user.name conduit-test');
  fs.writeFileSync(path.join(repo, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');

  const convoyDir = path.join(repo, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'),
    `id: "${convoyId}"\nstage: 3\nstatus: active\nwork_type: net-new\nbase_branch: master\n`, 'utf-8');
  fs.writeFileSync(path.join(convoyDir, 'living-spec.md'), '# spec\n', 'utf-8');
  const wsDir = path.join(convoyDir, 'workstreams', 'ws1');
  fs.mkdirSync(wsDir, { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'ACCEPTANCE.md'), '# AC\n', 'utf-8');
  fs.mkdirSync(path.join(convoyDir, 'audit'), { recursive: true });

  // Directive declaring a check-id that maps to a throwing executor.
  const dirSubdir = path.join(repo, 'directives', 'net-new', 'stages');
  fs.mkdirSync(dirSubdir, { recursive: true });
  fs.writeFileSync(path.join(dirSubdir, '03-implementation.md'), [
    '# Stage 3',
    '',
    '## Gate 3 Criteria (Pre-Gate Checklist)',
    '- [ ] **test-throw**: synthetic executor that always throws',
    '',
    '## Step 1',
    'Stub.',
  ].join('\n'), 'utf-8');

  fs.writeFileSync(path.join(repo, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '0.0.0', scripts: { build: 'node -e ""', test: 'node -e ""' } }, null, 2), 'utf-8');
  git(repo, 'add -A');
  git(repo, 'commit -m initial');

  return { repo, convoyId, cleanup: () => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* */ }
  }};
}

async function captureRunPreGate(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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

describe('pre-gate — AC-9a EXEC-ERROR prefix surfacing', () => {
  it('renders EXEC-ERROR: prefix in stdout AND markdown when a directive-declared executor throws', async () => {
    const fx = setupConvoyWithThrowingCheck('throws');
    // Inject a throwing executor under the synthetic id the directive declares.
    EXECUTORS['test-throw'] = async () => { throw new Error('synthetic boom'); };
    try {
      const { exitCode, stdout } = await captureRunPreGate([fx.convoyId, 'gate-3', '--repo', fx.repo]);
      // Throw → exec-error → renderRow surfaces with FAIL token + EXEC-ERROR: prefix
      assert.match(stdout, /EXEC-ERROR: synthetic boom/);
      // The verdict is BLOCKED (exec-error counts as fail per pre-gate.ts verdict logic)
      assert.equal(exitCode, 1, 'expected BLOCKED exit 1 when an executor throws');

      // The result markdown file must persist the EXEC-ERROR: prefix for peer review.
      const resultFile = path.join(fx.repo, 'convoys', 'active', fx.convoyId, 'audit', 'pre-gate-3-result.md');
      assert.ok(fs.existsSync(resultFile), 'result markdown not written');
      const md = fs.readFileSync(resultFile, 'utf-8');
      assert.match(md, /EXEC-ERROR: synthetic boom/);
    } finally {
      delete EXECUTORS['test-throw'];
      fx.cleanup();
    }
  });
});
