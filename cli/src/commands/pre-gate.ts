// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/pre-gate.ts
// description: Pre-gate verification (CLI-2). Runs the universal 5 checks
//              alongside every `**check-id**` declared in the relevant stage
//              directive's Gate N Criteria section. Writes the full results
//              table to audit/pre-gate-<N>-result.md so peer reviewers see
//              every PASS / FAIL / SKIP / ACCEPTED row when evaluating the
//              gate request bundle.
// owner:       BOTH
// update:      Manual when verification requirements change.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { resolveRepoPath, resolveConvoyRoot, ConduitNotInitializedError } from '../utils.js';
import { checkPermission } from '../internal/signals.js';
import { isHeadless } from '../internal/headless-io.js';
import { loadHeadlessContext, type ContextSchema } from '../internal/context-parser.js';
import { headlessOutput } from '../internal/headless-output.js';
import { parseDirectiveChecklist, type ChecklistItem } from '../internal/directive-checklist.js';
import {
  EXECUTORS,
  lookupExecutor,
  makeDiffScopeLazy,
  type CheckContext,
  type CheckResult,
  type CheckStatus,
} from '../internal/pre-gate-checks.js';

/** Headless CONTEXT schema (headless-protocol §a) — convoy_id required;
 *  `gate` optional (defaults to the convoy's current stage gate). */
const HEADLESS_SCHEMA: ContextSchema = { command: 'pre-gate', required: ['convoy_id'] };

interface RowResult extends CheckResult {
  id: string;
  label: string;
}

const UNIVERSAL_IDS: { id: string; label: string }[] = [
  { id: 'build', label: 'Build (`npm run build`)' },
  { id: 'tests', label: 'Test suite (`npm test`)' },
  { id: 'living-spec', label: 'Living spec present' },
  { id: 'acceptance', label: 'Acceptance criteria present' },
  { id: 'token-budget', label: 'Living-spec token budget' },
];

function readConvoyStage(yamlPath: string): number {
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const m = content.match(/^stage:\s*(\d+)/m);
  return m ? parseInt(m[1], 10) : 0;
}

function readWorkType(yamlPath: string): string {
  if (!fs.existsSync(yamlPath)) return 'net-new';
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const m = content.match(/^work_type:\s*["']?([^"'\n]+)["']?/m);
  return (m ? m[1].trim() : 'net-new');
}

function directiveSubdir(workType: string): string {
  const map: Record<string, string> = {
    'net-new': 'net-new',
    feature: 'net-new',
    enhancement: 'enhancement',
    bug: 'bug-fix',
    'bug-fix': 'bug-fix',
    maintenance: 'maintenance',
  };
  return map[workType] ?? 'net-new';
}

function stageDirectivePath(repoPath: string, dirSubdir: string, stage: number): string {
  const stageStr = String(stage).padStart(2, '0');
  return path.join(repoPath, 'directives', dirSubdir, 'stages', `${stageStr}-*.md`);
}

function findStageDirective(repoPath: string, dirSubdir: string, stage: number): string | null {
  const dir = path.join(repoPath, 'directives', dirSubdir, 'stages');
  if (!fs.existsSync(dir)) return null;
  const stagePrefix = String(stage).padStart(2, '0') + '-';
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(stagePrefix) && name.endsWith('.md')) {
      return path.join(dir, name);
    }
  }
  return null;
}

function parseAcceptFlags(args: string[]): { accepts: Map<string, string>; remaining: string[] } {
  const accepts = new Map<string, string>();
  const remaining: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--accept') {
      const value = args[++i];
      if (!value) throw new Error('missing value for --accept (expected "id:reason")');
      const colon = value.indexOf(':');
      if (colon < 1) throw new Error(`--accept value must be "<id>:<reason>", got: ${value}`);
      accepts.set(value.slice(0, colon).trim(), value.slice(colon + 1).trim());
    } else {
      remaining.push(args[i]);
    }
  }
  return { accepts, remaining };
}

function parseGateArg(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^gate-?(\d+)$/i) ?? value.match(/^(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

const STATUS_ICON: Record<CheckStatus, string> = {
  pass: '✓',
  fail: '✗',
  skip: '○',
  warn: '⚠',
  'exec-error': '!',
  accepted: 'A',
};

function statusToken(status: CheckStatus): string {
  switch (status) {
    case 'pass': return 'PASS';
    case 'fail': return 'FAIL';
    case 'skip': return 'SKIP';
    case 'warn': return 'WARN';
    case 'exec-error': return 'FAIL';
    case 'accepted': return 'ACCEPTED';
  }
}

function applyAcceptance(row: RowResult, accepts: Map<string, string>): RowResult {
  if ((row.status === 'fail' || row.status === 'exec-error') && accepts.has(row.id)) {
    return { ...row, status: 'accepted', detail: `accepted by requester: ${accepts.get(row.id)}` };
  }
  return row;
}

function renderRow(row: RowResult): string {
  const token = statusToken(row.status);
  const detail = row.status === 'exec-error'
    ? `EXEC-ERROR: ${row.detail}`
    : row.detail;
  return `[${token}] ${row.label}  ·  ${detail}`;
}

function renderResultMarkdown(rows: RowResult[], gateNum: number): string {
  const lines: string[] = [];
  lines.push(`# Pre-Gate Result — Gate ${gateNum}`);
  lines.push('');
  lines.push('| # | Status | ID | Label | Detail |');
  lines.push('|---|--------|----|-------|--------|');
  rows.forEach((r, i) => {
    const detail = r.status === 'exec-error' ? `EXEC-ERROR: ${r.detail}` : r.detail;
    lines.push(`| ${i + 1} | ${statusToken(r.status)} | \`${r.id}\` | ${r.label.replace(/\|/g, '\\|')} | ${detail.replace(/\|/g, '\\|').slice(0, 200)} |`);
  });
  return lines.join('\n') + '\n';
}

export async function runPreGate(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('help')) {
    console.log('usage: conduit pre-gate [convoy-id] [gate-N] [--accept "id:reason"]... [--repo path]');
    console.log('');
    console.log('Runs the universal 5 checks plus every **check-id** declared in the');
    console.log('relevant stage directive\'s Gate N Criteria (Pre-Gate Checklist) section.');
    console.log('');
    console.log('Universal checks: build, tests, living-spec, acceptance, token-budget.');
    console.log('Stage 3 declared (per directive): lint, console-log-audit, commented-code-audit.');
    console.log('Stage 5 declared (per directive): audit-summary (uses CLI-3 in-process).');
    console.log('');
    console.log('Exit codes:');
    console.log('  0  READY — all checks pass (or accepted via --accept)');
    console.log('  1  BLOCKED — one or more checks failed');
    console.log('  2  not in a Conduit convoy context');
    return;
  }

  // AC-1/AC-3: CONTEXT from stdin; convoy_id (and optional gate) backfill
  // the positionals when argv omits them (argv wins when both are present).
  let hctx: Record<string, unknown> | null = null;
  if (isHeadless()) {
    hctx = loadHeadlessContext(HEADLESS_SCHEMA);
  }

  const { accepts, remaining: afterAccept } = parseAcceptFlags(args);
  const { remaining, repoPath } = resolveRepoPath(afterAccept);
  const convoyRepoPath = resolveConvoyRoot(repoPath);
  checkPermission(repoPath, 'read');

  // ── Resolve convoy and gate (AC-8b: missing → exit 2; headless → exit 4) ──
  let convoyId = remaining[0] ?? (hctx ? String(hctx['convoy_id']) : undefined);
  if (!convoyId) {
    const activeDir = path.join(convoyRepoPath, 'convoys', 'active');
    if (fs.existsSync(activeDir)) {
      const dirs = fs.readdirSync(activeDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name !== '_template');
      if (dirs.length > 0) convoyId = dirs[0].name;
    }
  }
  if (!convoyId || !fs.existsSync(path.join(convoyRepoPath, 'convoys', 'active', convoyId))) {
    // Headless maps this to the exit-4 not-initialized document (AC-15) —
    // interactive keeps its historical exit 2.
    if (isHeadless()) throw new ConduitNotInitializedError('not in a Conduit convoy context — run from the convoy\'s repo root');
    console.error('not in a Conduit convoy context — run from the convoy\'s repo root');
    process.exitCode = 2;
    return;
  }

  const yamlPath = path.join(convoyRepoPath, 'convoys', 'active', convoyId, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) {
    if (isHeadless()) throw new ConduitNotInitializedError('not in a Conduit convoy context — run from the convoy\'s repo root');
    console.error('not in a Conduit convoy context — run from the convoy\'s repo root');
    process.exitCode = 2;
    return;
  }

  const stage = readConvoyStage(yamlPath);
  const workType = readWorkType(yamlPath);

  // gate-N defaults to current convoy stage (gate-N == "the gate I'd request next")
  const gateArg = parseGateArg(remaining[1]) ?? (hctx && hctx['gate'] !== undefined ? parseGateArg(String(hctx['gate'])) : undefined);
  const gateNum = gateArg ?? stage;

  // Target repo for build/tests — for now same as convoyRepoPath unless repo_slug names a sibling.
  let targetRepoPath = repoPath;
  const repoSlugMatch = fs.readFileSync(yamlPath, 'utf-8').match(/^repo_slug:\s*["']?([^"'\n]+)["']?/m);
  if (repoSlugMatch) {
    const candidate = path.join(path.dirname(convoyRepoPath), repoSlugMatch[1].trim());
    if (fs.existsSync(candidate)) targetRepoPath = candidate;
  }

  // ── Resolve the directive items for this gate (AC-9: empty → universal-only) ──
  const directivePath = findStageDirective(convoyRepoPath, directiveSubdir(workType), gateNum);
  let directiveItems: ChecklistItem[] = [];
  if (directivePath && fs.existsSync(directivePath)) {
    directiveItems = parseDirectiveChecklist(fs.readFileSync(directivePath, 'utf-8'), gateNum);
  }

  // De-dup: if directive already declares a universal id, skip the auto-prepend.
  const declaredIds = new Set(directiveItems.map(i => i.id));
  const items: ChecklistItem[] = [
    ...UNIVERSAL_IDS.filter(u => !declaredIds.has(u.id)),
    ...directiveItems,
  ];

  const RULE = '━'.repeat(62);
  console.log(RULE);
  console.log('CONDUIT PRE-GATE VERIFICATION');
  console.log(`Convoy:  ${convoyId}`);
  console.log(`Gate:    ${gateNum}`);
  console.log(`Target:  ${path.basename(targetRepoPath)}`);
  console.log(RULE);
  console.log('');

  const ctx: CheckContext = {
    repoPath: targetRepoPath,
    convoyRepoPath,
    convoyId,
    gateNum,
    diffScope: makeDiffScopeLazy(targetRepoPath, convoyId),
  };

  const rows: RowResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const exec = lookupExecutor(item.id);
    // console.log (not stdout.write) so the headless console patch routes
    // this progress line to stderr JSON events (AC-9: stdout = one document).
    console.log(`  [${i + 1}/${items.length}] ${item.id}…`);
    let res: CheckResult;
    if (!exec) {
      res = { status: 'skip', detail: `no executor registered for check id '${item.id}'` };
    } else {
      // Per-check timeout override (defect #3) — propagates from
      // directive-checklist `(timeout: Ns)` annotation into ctx.timeoutMs
      // for this single executor invocation.
      const itemCtx: CheckContext = { ...ctx, timeoutMs: item.timeoutMs };
      try {
        res = await exec(itemCtx);
      } catch (err: any) {
        res = { status: 'exec-error', detail: err?.message ?? 'executor threw' };
      }
    }
    const row: RowResult = applyAcceptance({ id: item.id, label: item.label, ...res }, accepts);
    rows.push(row);
  }

  // ── Render rows in AC-5 format ──
  console.log('');
  console.log('RESULTS');
  for (const row of rows) {
    const icon = STATUS_ICON[row.status];
    const time = row.durationMs && row.durationMs > 0 ? `  (${(row.durationMs / 1000).toFixed(1)}s)` : '';
    console.log(`  ${icon} ${renderRow(row)}${time}`);
  }

  // ── Write audit/pre-gate-<N>-result.md (AC-8a evidence for peer reviewers) ──
  const auditDir = path.join(convoyRepoPath, 'convoys', 'active', convoyId, 'audit');
  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(path.join(auditDir, `pre-gate-${gateNum}-result.md`), renderResultMarkdown(rows, gateNum), 'utf-8');

  // ── Verdict + exit code per AC-8 ──
  const failed = rows.filter(r => r.status === 'fail' || r.status === 'exec-error');
  const accepted = rows.filter(r => r.status === 'accepted');
  const passed = rows.filter(r => r.status === 'pass');
  const warned = rows.filter(r => r.status === 'warn');

  console.log('');

  // Headless verdict (AC-9): READY → SUCCESS / exit 0; BLOCKED → SEND_BACK /
  // exit 10 (advisory verdict, distinct from internal error = 1).
  if (isHeadless()) {
    const verdict = failed.length > 0 ? 'SEND_BACK' : 'SUCCESS';
    headlessOutput({
      command: 'pre-gate',
      convoy_id: convoyId,
      verdict,
      gate: `gate-${gateNum}`,
      checks: rows.map(r => ({ id: r.id, status: r.status, detail: r.detail ?? '' })),
      summary: {
        passed: passed.length,
        failed: failed.length,
        accepted: accepted.length,
        warned: warned.length,
        total: rows.length,
      },
      artifacts: [`convoys/active/${convoyId}/audit/pre-gate-${gateNum}-result.md`],
    });
    if (verdict === 'SEND_BACK') process.exitCode = 10;
    return;
  }

  if (failed.length > 0) {
    console.log(`VERDICT: BLOCKED — ${failed.length} check(s) failed.`);
    console.log(`  Failed: ${failed.map(r => r.id).join(', ')}`);
    if (accepted.length > 0) console.log(`  Accepted: ${accepted.map(r => r.id).join(', ')}`);
    process.exitCode = 1;
  } else {
    const total = rows.length;
    const summary = accepted.length > 0
      ? `${passed.length} pass / ${accepted.length} accepted / ${warned.length} warn / ${total} total`
      : `${passed.length}/${total} passed${warned.length > 0 ? ` (${warned.length} warn)` : ''}`;
    console.log(`VERDICT: READY — ${summary}. Safe to request gate.`);
    if (accepted.length > 0) console.log(`  Accepted: ${accepted.map(r => r.id).join(', ')}`);
  }
  console.log('');
}
