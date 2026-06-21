// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/pre-gate-checks.ts
// description: Executor registry for `conduit pre-gate` (CLI-2). Maps each
//              `**check-id**` declared in a stage directive's Gate N Criteria
//              section to an async function returning a CheckResult. Built-in
//              executors cover the 5 universal checks plus the AC-6 Stage 3
//              checks (lint, console-log-audit, commented-code-audit) and the
//              AC-7 Stage 5 check (audit-summary, in-process CLI-3 invocation).
//              Unknown check-ids resolve to SKIP rows so the parser can stay
//              forward-compatible with future directive items.
//              Defect #3 (Stage 2 Decisions Log): the `tests` executor's
//              compiled-in default rises to 600s; non-`tests` executors keep
//              120s; per-check `(timeout: Ns)` overrides flow through
//              CheckContext.timeoutMs (resolved by `resolveExecutorTimeout`).
// owner:       BOTH
// update:      Manual when executor registry changes.
// schema:      none
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { estimateTokens, formatTokens } from './tokens.js';
import { resolveDiffScope, type DiffScope } from './diff-scope.js';
import { auditSummary } from '../commands/audit-summary.js';

export type CheckStatus = 'pass' | 'fail' | 'skip' | 'warn' | 'exec-error' | 'accepted';

export interface CheckResult {
  status: CheckStatus;
  detail: string;
  durationMs?: number;
}

export interface CheckContext {
  repoPath: string;
  convoyRepoPath: string;
  convoyId?: string;
  gateNum: number;
  diffScope: () => DiffScope;
  /**
   * Per-check timeout override in milliseconds, sourced from a directive's
   * `**id** (timeout: Ns):` annotation (parsed by directive-checklist.ts).
   * When undefined, executors fall back to their compiled-in default via
   * `resolveExecutorTimeout`. Defect #3 — Stage 2 Decisions Log.
   */
  timeoutMs?: number;
}

export type Executor = (ctx: CheckContext) => Promise<CheckResult>;

/**
 * Compiled-in default timeout for the `tests` executor.
 * Raised from 120s to 600s per defect #3, then to 1200s as suite grew to
 * 365 tests / ~800s on the conduit repo itself as of 2026-05-20.
 */
export const TESTS_DEFAULT_TIMEOUT_MS = 1200000;

/**
 * Compiled-in default timeout for every non-`tests` executor (build, lint,
 * audit-summary, etc.). Unchanged at 120s — these checks remain fast and
 * a longer cap would mask hangs.
 */
export const OTHER_DEFAULT_TIMEOUT_MS = 120000;

/**
 * Resolve the effective timeout for an executor invocation.
 * Per-check override (from directive markdown `(timeout: Ns)` annotation) wins;
 * falls back to TESTS_DEFAULT_TIMEOUT_MS for `tests`, OTHER_DEFAULT_TIMEOUT_MS
 * for everything else. An override of 0 (or any falsy value) is treated as
 * "no override" — defaults apply. Defect #3 — Stage 2 Decisions Log.
 */
export function resolveExecutorTimeout(executorId: string, override: number | undefined): number {
  if (override && override > 0) return override;
  return executorId === 'tests' ? TESTS_DEFAULT_TIMEOUT_MS : OTHER_DEFAULT_TIMEOUT_MS;
}

function execScript(cwd: string, cmd: string, timeoutMs = OTHER_DEFAULT_TIMEOUT_MS): CheckResult {
  const start = Date.now();
  try {
    execSync(cmd, { cwd, stdio: 'pipe', timeout: timeoutMs });
    return { status: 'pass', detail: 'ok', durationMs: Date.now() - start };
  } catch (err: any) {
    const out = (err.stderr?.toString() || err.stdout?.toString() || '').trim().slice(0, 200);
    return { status: 'fail', detail: out || (err.message ?? 'failed'), durationMs: Date.now() - start };
  }
}

function readPkgScripts(repoPath: string): Record<string, string> | null {
  const pkgPath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return (pkg.scripts ?? {}) as Record<string, string>;
  } catch {
    return null;
  }
}

function grepInDiff(
  ctx: CheckContext,
  pattern: RegExp,
  label: string,
  maxHits = 10,
): CheckResult {
  const scope = ctx.diffScope();
  if (scope.orphan) {
    return { status: 'warn', detail: `orphan branch — no merge-base to ${scope.base}, skipping` };
  }
  if (scope.changedFiles.length === 0) {
    return { status: 'pass', detail: 'no changed source files in diff' };
  }
  const hits: string[] = [];
  for (const rel of scope.changedFiles) {
    const abs = path.join(ctx.repoPath, rel);
    if (!fs.existsSync(abs)) continue;
    let content: string;
    try { content = fs.readFileSync(abs, 'utf-8'); } catch { continue; }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        hits.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
        if (hits.length >= maxHits) break;
      }
    }
    if (hits.length >= maxHits) break;
  }
  if (hits.length === 0) {
    return { status: 'pass', detail: `${label}: 0 matches in ${scope.changedFiles.length} changed file(s)` };
  }
  return {
    status: 'fail',
    detail: `${label}: ${hits.length}${hits.length >= maxHits ? '+' : ''} match(es) — ${hits.slice(0, 3).join(' | ')}${hits.length > 3 ? ` (+${hits.length - 3} more)` : ''}`,
  };
}

const CONSOLE_PATTERN = /\bconsole\.(log|debug|info)\b/;
const COMMENTED_CODE_PATTERN = /^\s*\/\/\s*(if|for|while|return|const|let|var|function|class|import|export)\b/;

const TOKEN_BUDGET_WARN = 50000;

export const EXECUTORS: Record<string, Executor> = {
  build: async (ctx) => {
    const scripts = readPkgScripts(ctx.repoPath);
    if (!scripts) return { status: 'skip', detail: 'no package.json' };
    if (!scripts.build) return { status: 'skip', detail: 'no build script declared' };
    return execScript(ctx.repoPath, 'npm run build', resolveExecutorTimeout('build', ctx.timeoutMs));
  },

  tests: async (ctx) => {
    const scripts = readPkgScripts(ctx.repoPath);
    if (!scripts) return { status: 'skip', detail: 'no package.json' };
    if (!scripts.test && !scripts.tests) return { status: 'skip', detail: 'no test script declared' };
    return execScript(ctx.repoPath, 'npm test', resolveExecutorTimeout('tests', ctx.timeoutMs));
  },

  'living-spec': async (ctx) => {
    if (!ctx.convoyId) return { status: 'skip', detail: 'no active convoy' };
    const specPath = path.join(ctx.convoyRepoPath, 'convoys', 'active', ctx.convoyId, 'living-spec.md');
    return fs.existsSync(specPath)
      ? { status: 'pass', detail: 'living-spec.md present' }
      : { status: 'fail', detail: 'living-spec.md missing' };
  },

  acceptance: async (ctx) => {
    if (!ctx.convoyId) return { status: 'skip', detail: 'no active convoy' };
    const wsDir = path.join(ctx.convoyRepoPath, 'convoys', 'active', ctx.convoyId, 'workstreams');
    if (!fs.existsSync(wsDir)) return { status: 'warn', detail: 'no workstreams directory' };
    const hasAc = fs.readdirSync(wsDir).some(ws =>
      fs.existsSync(path.join(wsDir, ws, 'ACCEPTANCE.md')),
    );
    return hasAc
      ? { status: 'pass', detail: 'ACCEPTANCE.md found' }
      : { status: 'warn', detail: 'no ACCEPTANCE.md in workstreams' };
  },

  'token-budget': async (ctx) => {
    if (!ctx.convoyId) return { status: 'skip', detail: 'no active convoy' };
    const specPath = path.join(ctx.convoyRepoPath, 'convoys', 'active', ctx.convoyId, 'living-spec.md');
    if (!fs.existsSync(specPath)) return { status: 'skip', detail: 'no living-spec.md' };
    const tokens = estimateTokens(fs.readFileSync(specPath, 'utf-8'));
    return tokens > TOKEN_BUDGET_WARN
      ? { status: 'warn', detail: `living-spec: ${formatTokens(tokens)} — consider summarizing` }
      : { status: 'pass', detail: `living-spec: ${formatTokens(tokens)}` };
  },

  lint: async (ctx) => {
    const scripts = readPkgScripts(ctx.repoPath);
    if (!scripts) return { status: 'skip', detail: 'no package.json' };
    const timeoutMs = resolveExecutorTimeout('lint', ctx.timeoutMs);
    if (scripts.lint) return execScript(ctx.repoPath, 'npm run lint', timeoutMs);
    if (scripts.check) return execScript(ctx.repoPath, 'npm run check', timeoutMs);
    return { status: 'skip', detail: 'no lint/check script declared' };
  },

  'console-log-audit': async (ctx) => grepInDiff(ctx, CONSOLE_PATTERN, 'console.* in non-test files'),

  'commented-code-audit': async (ctx) => grepInDiff(ctx, COMMENTED_CODE_PATTERN, 'commented-out code in non-test files'),

  'audit-summary': async (ctx) => {
    try {
      const result = await auditSummary({ cwd: ctx.repoPath, strict: false });
      switch (result.exitCode) {
        case 0: {
          const summary = result.stdout.includes('0 advisories') ? '0 advisories — clean' : 'MOD/LOW only';
          return { status: 'pass', detail: `audit-summary: ${summary}` };
        }
        case 1: {
          const firstRow = result.stdout.split('\n').find(l => /^\|\s*\d+\s*\|/.test(l)) ?? 'HIGH/CRITICAL advisories present';
          return { status: 'fail', detail: `audit-summary BLOCKED — ${firstRow.slice(0, 160)}` };
        }
        case 2:
          return { status: 'skip', detail: result.stderr.trim() || 'no package.json — not a Node project root' };
        case 3:
          return { status: 'exec-error', detail: result.stderr.trim() || 'npm audit failed' };
      }
    } catch (err: any) {
      return { status: 'exec-error', detail: err?.message ?? 'audit-summary threw' };
    }
  },
};

export function lookupExecutor(id: string): Executor | undefined {
  return EXECUTORS[id];
}

export function makeDiffScopeLazy(repoPath: string, convoyId?: string): () => DiffScope {
  let cached: DiffScope | undefined;
  return () => {
    if (!cached) cached = resolveDiffScope(repoPath, { convoyId });
    return cached;
  };
}
