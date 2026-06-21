// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/usage.ts
// description: Usage command group — record and report Claude model usage
//              per convoy stage. `record` appends a model_usage event to
//              events.jsonl; `report` aggregates by stage and audits stage
//              vs. directive-recommended model.
// owner:       BOTH
// update:      Manual when stage→model policy changes (see STAGE_POLICY).
// schema:      convoys/schema/events.schema.json
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { checkPermission } from '../internal/signals.js';
import { resolveRepoPath, resolveConvoyRoot, parseFlagValue } from '../utils.js';
import { appendConvoyEvent, readConvoyEvents, type ModelUsage, type FileRead } from '../internal/convoy-events.js';
import { loadBehaviors } from '../internal/behaviors.js';
import { gitSync } from '../internal/git-sync.js';
import { estimateFileTokens } from '../internal/tokens.js';

// Repeatable flag: returns every occurrence of `--flag VALUE`, leaves rest.
function parseRepeatedFlag(args: string[], flag: string): { values: string[]; remaining: string[] } {
  const values: string[] = [];
  const remaining: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      if (i + 1 >= args.length) throw new Error(`missing value for ${flag}`);
      values.push(args[++i]);
    } else {
      remaining.push(args[i]);
    }
  }
  return { values, remaining };
}

// ── Stage → recommended model policy ─────────────────────────────────
// Mirrors directives/net-new/stages/0N-*.md. When a stage permits multiple
// models conditionally (e.g. Stage 2/3 escalate to Opus for security work),
// the entry lists *acceptable* models — the audit only flags a mismatch
// when the recorded model is in none of them.
//
// Keep this in sync when directives change. Single source of truth lives in
// the directive markdown; this is a runtime mirror so `usage report` can
// audit without parsing markdown.
export interface StagePolicy {
  recommended: string;       // canonical model for the stage
  also_acceptable?: string[]; // models that are policy-compliant in some scenarios
  required?: boolean;        // true => only `recommended` is acceptable
}

export const STAGE_POLICY: Record<number, StagePolicy> = {
  0: { recommended: 'claude-sonnet-4-6' },
  1: { recommended: 'claude-sonnet-4-6' },
  2: { recommended: 'claude-sonnet-4-6', also_acceptable: ['claude-opus-4-6'] },
  3: { recommended: 'claude-sonnet-4-6', also_acceptable: ['claude-opus-4-6'] },
  4: { recommended: 'claude-sonnet-4-6' },
  5: { recommended: 'claude-opus-4-6', required: true },
  6: { recommended: 'claude-sonnet-4-6' },
  7: { recommended: 'claude-haiku-4-5', also_acceptable: ['claude-sonnet-4-6'] },
  8: { recommended: 'claude-haiku-4-5', also_acceptable: ['claude-sonnet-4-6'] },
};

const STAGE_NAMES: Record<number, string> = {
  0: 'Intake',
  1: 'BA Requirements',
  2: 'Solution Design',
  3: 'Implementation',
  4: 'QA Unit',
  5: 'QA Security',
  6: 'QA Regression',
  7: 'BP Comms',
  8: 'Release',
};

function parseIntFlag(args: string[], flag: string): { value?: number; remaining: string[] } {
  const { value, remaining } = parseFlagValue(args, flag);
  if (!value) return { remaining };
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) throw new Error(`${flag} must be a non-negative integer (got: ${value})`);
  return { value: n, remaining };
}

function findActiveConvoyRoot(repoPath: string, explicit?: string): string {
  const activeDir = path.join(repoPath, 'convoys', 'active');
  if (!fs.existsSync(activeDir)) {
    throw new Error(`no convoys/active directory under ${repoPath}`);
  }
  if (explicit) {
    const explicitPath = path.join(activeDir, explicit);
    if (!fs.existsSync(explicitPath)) throw new Error(`convoy ${explicit} not found in convoys/active/`);
    return explicitPath;
  }
  const candidates = fs.readdirSync(activeDir).filter(d => !d.startsWith('_') && !d.startsWith('.'));
  const dirs = candidates.filter(d => fs.statSync(path.join(activeDir, d)).isDirectory());
  if (dirs.length === 0) throw new Error('no active convoys found');
  if (dirs.length > 1) {
    throw new Error(`multiple active convoys (${dirs.join(', ')}) — pass --convoy <id>`);
  }
  return path.join(activeDir, dirs[0]);
}

function readStageFromYaml(convoyRoot: string): number | undefined {
  const yamlPath = path.join(convoyRoot, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) return undefined;
  const match = fs.readFileSync(yamlPath, 'utf-8').match(/^stage:\s*(\d+)/m);
  return match ? parseInt(match[1], 10) : undefined;
}

function policyVerdict(stage: number, model: string): { ok: boolean; expected: string; reason?: string } {
  const policy = STAGE_POLICY[stage];
  if (!policy) return { ok: true, expected: '(no policy)' };
  if (model === policy.recommended) return { ok: true, expected: policy.recommended };
  if (policy.required) {
    return { ok: false, expected: policy.recommended, reason: `Stage ${stage} requires ${policy.recommended}` };
  }
  if (policy.also_acceptable?.includes(model)) {
    return { ok: true, expected: policy.recommended, reason: 'acceptable variant' };
  }
  return { ok: false, expected: policy.recommended };
}

// ── usage record ────────────────────────────────────────────────────
async function recordUsage(args: string[]): Promise<void> {
  const { remaining: r0, repoPath } = resolveRepoPath(args);
  const convoyRepoPath = resolveConvoyRoot(repoPath);
  checkPermission(convoyRepoPath, 'write');

  const { value: convoyFlag, remaining: r1 } = parseFlagValue(r0, '--convoy');
  const { value: model, remaining: r2 } = parseFlagValue(r1, '--model');
  const { value: stageRaw, remaining: r3 } = parseFlagValue(r2, '--stage');
  const { value: input, remaining: r4 } = parseIntFlag(r3, '--input');
  const { value: output, remaining: r5 } = parseIntFlag(r4, '--output');
  const { value: cacheRead, remaining: r6 } = parseIntFlag(r5, '--cache-read');
  const { value: cacheCreate, remaining: r7 } = parseIntFlag(r6, '--cache-creation');
  const { value: notes, remaining: r8 } = parseFlagValue(r7, '--notes');
  const { values: readFiles, remaining: r9 } = parseRepeatedFlag(r8, '--read-file');
  void r9;

  if (!model) throw new Error('usage: conduit usage record --model <model> --stage <N> [--input N] [--output N] [--cache-read N] [--read-file <path>] [--convoy ID] [--notes "..."]');

  const convoyRoot = findActiveConvoyRoot(convoyRepoPath, convoyFlag || undefined);
  const convoyId = path.basename(convoyRoot);

  let stage: number;
  if (stageRaw !== undefined && stageRaw !== '') {
    stage = parseInt(stageRaw, 10);
    if (Number.isNaN(stage)) throw new Error(`--stage must be an integer (got: ${stageRaw})`);
  } else {
    const inferred = readStageFromYaml(convoyRoot);
    if (inferred === undefined) throw new Error('--stage is required (could not infer from convoy.yaml)');
    stage = inferred;
  }

  const usage: ModelUsage = { model };
  if (input !== undefined) usage.input_tokens = input;
  if (output !== undefined) usage.output_tokens = output;
  if (cacheRead !== undefined) usage.cache_read_tokens = cacheRead;
  if (cacheCreate !== undefined) usage.cache_creation_tokens = cacheCreate;

  if (readFiles.length > 0) {
    const files: FileRead[] = [];
    for (const raw of readFiles) {
      // Accept absolute or repo-relative; normalize to repo-relative for portability.
      const abs = path.isAbsolute(raw) ? raw : path.resolve(convoyRepoPath, raw);
      const rel = path.relative(convoyRepoPath, abs).replace(/\\/g, '/') || raw;
      const est = fs.existsSync(abs) ? estimateFileTokens(abs) : 0;
      files.push({ path: rel, est_tokens: est });
    }
    usage.files_read = files;
  }

  appendConvoyEvent({
    ts: new Date().toISOString(),
    type: 'model_usage',
    convoy: convoyId,
    stage,
    usage,
    ...(notes ? { notes } : {}),
  }, convoyRoot);

  // Optional auto-commit. Default off — see behaviors.yaml `usage` section.
  // model_usage events fire frequently; default-on would clutter git history.
  const behaviors = loadBehaviors(convoyRepoPath);
  if (behaviors.usage.auto_commit) {
    const eventsRel = path.relative(convoyRepoPath, path.join(convoyRoot, 'events.jsonl')).replace(/\\/g, '/');
    gitSync(
      convoyRepoPath,
      [eventsRel],
      `conduit: usage recorded for ${convoyId} stage ${stage} (${model})`,
      { push: behaviors.usage.auto_push },
    );
  }

  const verdict = policyVerdict(stage, model);
  const tag = verdict.ok ? 'OK' : 'POLICY MISMATCH';
  const note = verdict.ok ? '' : ` (expected ${verdict.expected})`;
  console.log(`CONDUIT: model_usage recorded — ${convoyId} stage ${stage} (${STAGE_NAMES[stage] ?? '?'}) model=${model} [${tag}]${note}`);
}

// ── usage report ────────────────────────────────────────────────────
interface StageRollup {
  stage: number;
  models: Map<string, { count: number; input: number; output: number; cacheRead: number; cacheCreate: number }>;
}

function aggregate(events: ReturnType<typeof readConvoyEvents>): Map<number, StageRollup> {
  const byStage = new Map<number, StageRollup>();
  for (const e of events) {
    if (e.type !== 'model_usage' || !e.usage || e.stage === undefined) continue;
    const stage = e.stage;
    if (!byStage.has(stage)) byStage.set(stage, { stage, models: new Map() });
    const roll = byStage.get(stage)!;
    const m = e.usage.model;
    if (!roll.models.has(m)) roll.models.set(m, { count: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
    const slot = roll.models.get(m)!;
    slot.count += 1;
    slot.input += e.usage.input_tokens ?? 0;
    slot.output += e.usage.output_tokens ?? 0;
    slot.cacheRead += e.usage.cache_read_tokens ?? 0;
    slot.cacheCreate += e.usage.cache_creation_tokens ?? 0;
  }
  return byStage;
}

function fmt(n: number): string {
  if (n === 0) return '-';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

async function reportUsage(args: string[]): Promise<void> {
  const { remaining: r0, repoPath } = resolveRepoPath(args);
  const convoyRepoPath = resolveConvoyRoot(repoPath);
  checkPermission(convoyRepoPath, 'read');

  const wantJson = r0.includes('--json');
  const wantTopFiles = r0.includes('--top-files');
  const r1 = r0.filter(a => a !== '--json' && a !== '--top-files');
  const positional = r1.filter(a => !a.startsWith('--'));
  const convoyId = positional[0];

  const convoyRoot = findActiveConvoyRoot(convoyRepoPath, convoyId);
  const events = readConvoyEvents(convoyRoot);
  const byStage = aggregate(events);

  // Aggregate file reads across all model_usage events.
  const fileTotals = new Map<string, { reads: number; tokens: number }>();
  for (const e of events) {
    if (e.type !== 'model_usage' || !e.usage?.files_read) continue;
    for (const f of e.usage.files_read) {
      if (!fileTotals.has(f.path)) fileTotals.set(f.path, { reads: 0, tokens: 0 });
      const slot = fileTotals.get(f.path)!;
      slot.reads += 1;
      slot.tokens += f.est_tokens ?? 0;
    }
  }

  if (wantJson) {
    const payload = Array.from(byStage.values()).map(roll => ({
      stage: roll.stage,
      stage_name: STAGE_NAMES[roll.stage] ?? null,
      policy_recommended: STAGE_POLICY[roll.stage]?.recommended ?? null,
      models: Array.from(roll.models.entries()).map(([model, t]) => ({
        model,
        verdict: policyVerdict(roll.stage, model),
        events: t.count,
        input_tokens: t.input,
        output_tokens: t.output,
        cache_read_tokens: t.cacheRead,
        cache_creation_tokens: t.cacheCreate,
      })),
    }));
    const topFiles = Array.from(fileTotals.entries())
      .map(([p, t]) => ({ path: p, reads: t.reads, est_tokens: t.tokens }))
      .sort((a, b) => b.est_tokens - a.est_tokens || b.reads - a.reads)
      .slice(0, 20);
    console.log(JSON.stringify({ convoy: path.basename(convoyRoot), stages: payload, top_files: topFiles }, null, 2));
    return;
  }

  const id = path.basename(convoyRoot);
  console.log(`# Usage Report — ${id}`);
  console.log('');
  if (byStage.size === 0) {
    console.log('No model_usage events recorded yet.');
    console.log('');
    console.log('Record usage with:');
    console.log('  conduit usage record --stage <N> --model <model> [--input N] [--output N]');
    return;
  }

  console.log('| Stage | Name              | Model                | Events | Input  | Output | Cache R | Policy |');
  console.log('|-------|-------------------|----------------------|--------|--------|--------|---------|--------|');
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, mismatches = 0;
  const stages = Array.from(byStage.keys()).sort((a, b) => a - b);
  for (const stage of stages) {
    const roll = byStage.get(stage)!;
    const stageName = (STAGE_NAMES[stage] ?? '?').padEnd(17);
    for (const [model, t] of roll.models.entries()) {
      const verdict = policyVerdict(stage, model);
      const tag = verdict.ok ? 'OK' : `MISMATCH (want ${verdict.expected})`;
      if (!verdict.ok) mismatches += 1;
      totalInput += t.input;
      totalOutput += t.output;
      totalCacheRead += t.cacheRead;
      console.log(`| ${String(stage).padEnd(5)} | ${stageName} | ${model.padEnd(20)} | ${String(t.count).padEnd(6)} | ${fmt(t.input).padEnd(6)} | ${fmt(t.output).padEnd(6)} | ${fmt(t.cacheRead).padEnd(7)} | ${tag} |`);
    }
  }
  console.log('');
  console.log(`**Totals** — input: ${fmt(totalInput)} · output: ${fmt(totalOutput)} · cache-read: ${fmt(totalCacheRead)}`);
  console.log(`**Policy compliance** — ${mismatches === 0 ? 'all stages OK' : `${mismatches} mismatch(es) — see directives/<work-type>/stages/`}`);

  if (wantTopFiles && fileTotals.size > 0) {
    console.log('');
    console.log('## Top Files Read (estimated tokens)');
    console.log('');
    console.log('| Reads | Est. Tokens | Path |');
    console.log('|-------|-------------|------|');
    const top = Array.from(fileTotals.entries())
      .sort((a, b) => b[1].tokens - a[1].tokens || b[1].reads - a[1].reads)
      .slice(0, 20);
    for (const [p, t] of top) {
      console.log(`| ${String(t.reads).padEnd(5)} | ${fmt(t.tokens).padEnd(11)} | ${p} |`);
    }
  } else if (wantTopFiles) {
    console.log('');
    console.log('_No files_read tracked yet — record with `conduit usage record --read-file <path>`._');
  }
}

// ── entrypoint ──────────────────────────────────────────────────────
export async function runUsage(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit usage <record|report> [args]');
    console.log('');
    console.log('  record   Append a model_usage event to the active convoy');
    console.log('  report   Aggregate model usage by stage and audit policy compliance');
    return;
  }

  const subcommand = args[0];
  const rest = args.slice(1);

  switch (subcommand) {
    case 'record': await recordUsage(rest); return;
    case 'report': await reportUsage(rest); return;
    default:
      throw new Error(`unknown usage subcommand: ${subcommand}`);
  }
}
