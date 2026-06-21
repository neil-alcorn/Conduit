// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/audit-summary.ts
// description: `conduit audit-summary` — runs `npm audit --json` from CWD and
//              emits a deduped markdown advisory table for gate-context bundles.
//              Exit code policy (AC-13/AC-13a/AC-14): 0 = clean OR MOD/LOW only,
//              1 = HIGH/CRITICAL present OR any with --strict, 2 = no
//              package.json (AC-10a), 3 = npm itself failed (AC-10b).
// owner:       BOTH
// update:      Manual when audit-summary contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  parseAuditJson,
  dedupAdvisories,
  renderTable,
  hasBlockingSeverity,
} from '../internal/npm-audit.js';

export type NpmAuditRunResult =
  | { ok: true; json: string }
  | { ok: false; error: string };

export interface AuditSummaryOptions {
  cwd: string;
  strict: boolean;
  runNpm?: (cwd: string) => Promise<NpmAuditRunResult>;
}

export interface AuditSummaryResult {
  exitCode: 0 | 1 | 2 | 3;
  stdout: string;
  stderr: string;
}

const PROGRESS_THRESHOLD_MS = 5000;
const NPM_TIMEOUT_MS = 60000;

function defaultRunNpm(cwd: string): Promise<NpmAuditRunResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: NpmAuditRunResult): void => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    const child = spawn('npm', ['audit', '--json'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    const progressTimer = setTimeout(() => {
      process.stderr.write('audit-summary: npm audit still running (>5s)…\n');
    }, PROGRESS_THRESHOLD_MS);
    const killTimer = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: `npm audit timed out after ${NPM_TIMEOUT_MS}ms` });
    }, NPM_TIMEOUT_MS);

    const cleanup = (): void => {
      clearTimeout(progressTimer);
      clearTimeout(killTimer);
    };

    child.on('error', (err) => {
      cleanup();
      finish({ ok: false, error: err.message });
    });
    child.stdout?.on('data', (chunk: Buffer) => { stdoutBuf += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });
    child.on('close', (code, signal) => {
      cleanup();
      if (signal) {
        finish({ ok: false, error: `npm audit terminated by signal ${signal}` });
        return;
      }
      // npm audit exits 0 (clean) or 1 (advisories found). Both are valid runs.
      if (code !== 0 && code !== 1) {
        const detail = stderrBuf.trim() || `exit code ${code}`;
        finish({ ok: false, error: `npm audit failed: ${detail}` });
        return;
      }
      finish({ ok: true, json: stdoutBuf });
    });
  });
}

export async function auditSummary(opts: AuditSummaryOptions): Promise<AuditSummaryResult> {
  const { cwd, strict } = opts;
  const runNpm = opts.runNpm ?? defaultRunNpm;

  if (!fs.existsSync(path.join(cwd, 'package.json'))) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `no package.json in ${cwd} — audit-summary requires a Node project root\n`,
    };
  }

  const runResult = await runNpm(cwd);
  if (!runResult.ok) {
    return {
      exitCode: 3,
      stdout: '',
      stderr: runResult.error.replace(/\n+$/, '') + '\n',
    };
  }

  let parsed;
  try {
    parsed = parseAuditJson(runResult.json);
  } catch (err) {
    return {
      exitCode: 3,
      stdout: '',
      stderr: `failed to parse npm audit JSON: ${(err as Error).message}\n`,
    };
  }

  const deduped = dedupAdvisories(parsed);
  const table = renderTable(deduped);
  const blocking = hasBlockingSeverity(deduped, { strict });

  return {
    exitCode: blocking ? 1 : 0,
    stdout: table,
    stderr: '',
  };
}

function printHelp(): void {
  console.log('usage: conduit audit-summary [--strict]');
  console.log('');
  console.log('Runs `npm audit --json` from the current directory and emits a markdown');
  console.log('table of unique advisories, suitable for inclusion in gate context bundles.');
  console.log('');
  console.log('Flags:');
  console.log('  --strict    Exit 1 on any advisory of any severity (default: only HIGH/CRITICAL block)');
  console.log('');
  console.log('Exit codes:');
  console.log('  0  clean, OR MOD/LOW only without --strict');
  console.log('  1  HIGH/CRITICAL present, OR any severity with --strict');
  console.log('  2  no package.json in cwd (couldn\'t run)');
  console.log('  3  npm itself failed (network, auth, lockfile)');
}

export async function runAuditSummary(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('help')) {
    printHelp();
    return;
  }
  const strict = args.includes('--strict');
  const result = await auditSummary({ cwd: process.cwd(), strict });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
