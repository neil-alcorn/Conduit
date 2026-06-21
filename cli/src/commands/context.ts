// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/context.ts
// description: Session bootstrap — prints everything the agent layer (Claude
//              Code, Codex CLI, etc.) needs to operate as the agentic execution
//              layer for an active convoy. CLI output strings respect the
//              CONDUIT_AGENT_NAME env var via internal/agent-name.ts.
// owner:       BOTH
// update:      Manual as context output changes.
// schema:      none
// last_update: 2026-06-15
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { resolveRepoPath, resolveConvoyRoot, validateConvoyId } from '../utils.js';
import { readConvoyEvents } from '../internal/convoy-events.js';
import type { GateEvent } from '../internal/gate-events.js';
import { readJSONL, readLatest, filterByWorkstream, DEFAULT_JSONL_PATH } from '../internal/checkpoint.js';
import { daysSince, formatReenrichmentOffer } from '../internal/staleness.js';
import { gitPull } from '../internal/git-sync.js';
import { loadBehaviors } from '../internal/behaviors.js';
import { estimateTokens, formatTokens } from '../internal/tokens.js';
import { agentName } from '../internal/agent-name.js';
import { agentHostLabel, getAgentHostPaths, hostWorkflowSurface } from '../internal/agent-host.js';
import { syncBundledSkillsToTargets, syncBundledAgentsToTargets, type BundledSkillInstallResult, type BundledAgentInstallResult } from '../internal/skills-install.js';
import { autoRegisterCwdRepo } from '../internal/conduit-config.js';

const STAGE_NAMES: Record<number, string> = {
  0: 'Intake',
  1: 'BA Requirements',
  2: 'Solution Design',
  3: 'Implementation',
  4: 'QA — Unit',
  5: 'QA — Security',
  6: 'QA — Regression',
  7: 'BP & Comms',
  8: 'Release',
};

function stageName(n: number): string {
  return STAGE_NAMES[n] ?? `Stage ${n}`;
}

function parseYamlField(content: string, field: string): string {
  const match = content.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : '';
}

function parseMetaField(content: string, field: string): string {
  const match = content.match(new RegExp(`^\\s+${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : '';
}

interface Workstream {
  id: string;
  title: string;
  repoSlug: string;
  stage: number;
  status: string;
  branch: string;
}

function parseWorkstreams(content: string): Workstream[] {
  const results: Workstream[] = [];
  const wsSection = content.indexOf('workstreams:');
  if (wsSection === -1) return results;
  // Extract from 'workstreams:' to next top-level key or end
  const after = content.slice(wsSection + 'workstreams:'.length);
  const nextKey = after.search(/\n[a-z_]/);
  const block = nextKey === -1 ? after : after.slice(0, nextKey);
  const entries = block.split(/(?=\s*- id:)/);
  for (const entry of entries) {
    if (!entry.trim() || !entry.includes('id:')) continue;
    const id = (entry.match(/id:\s*["']?([^"'\n]+)["']?/) ?? [])[1]?.trim() ?? '';
    const title = (entry.match(/title:\s*["']?([^"'\n]+)["']?/) ?? [])[1]?.trim() ?? '';
    const repoSlug = (entry.match(/repo_slug:\s*["']?([^"'\n]+)["']?/) ?? [])[1]?.trim() ?? '';
    const stageStr = (entry.match(/stage:\s*(\d+)/) ?? [])[1] ?? '0';
    const status = (entry.match(/status:\s*(\S+)/) ?? [])[1]?.trim() ?? '';
    const branch = (entry.match(/branch:\s*["']?([^"'\n]*)["']?/) ?? [])[1]?.trim() ?? '';
    if (id) results.push({ id, title, repoSlug, stage: parseInt(stageStr, 10), status, branch });
  }
  return results;
}

function findDirectivePath(repoPath: string, workType: string, stage: number): string {
  const dirTypeMap: Record<string, string> = {
    feature: 'net-new', 'net-new': 'net-new', enhancement: 'enhancement',
    bug: 'bug-fix', 'bug-fix': 'bug-fix', maintenance: 'maintenance',
  };
  const dirType = dirTypeMap[workType] ?? 'net-new';
  const stagesDir = path.join(repoPath, 'directives', dirType, 'stages');
  if (!fs.existsSync(stagesDir)) return '';
  const files = fs.readdirSync(stagesDir).sort();
  const prefix = String(stage).padStart(2, '0');
  const match = files.find(f => f.startsWith(prefix + '-'));
  return match ? path.join('directives', dirType, 'stages', match) : '';
}

// Extract "What This Stage Produces" section (first 8 lines after heading)
function extractStageProduces(directivePath: string): string[] {
  if (!fs.existsSync(directivePath)) return [];
  const content = fs.readFileSync(directivePath, 'utf-8');
  const idx = content.indexOf('## What This Stage Produces');
  if (idx === -1) return [];
  const section = content.slice(idx + '## What This Stage Produces'.length);
  const nextSection = section.search(/^## /m);
  const body = (nextSection === -1 ? section : section.slice(0, nextSection)).trim();
  return body.split('\n').slice(0, 8).filter(l => l.trim());
}

function scanActiveConvoys(repoPath: string): { id: string; status: string }[] {
  const activeDir = path.join(repoPath, 'convoys', 'active');
  if (!fs.existsSync(activeDir)) return [];
  return fs.readdirSync(activeDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template')
    .map(e => {
      const yamlPath = path.join(activeDir, e.name, 'convoy.yaml');
      const status = fs.existsSync(yamlPath)
        ? (fs.readFileSync(yamlPath, 'utf-8').match(/^status:\s*(\S+)/m)?.[1] ?? 'unknown')
        : 'unknown';
      return { id: e.name, status };
    });
}

export async function runContext(args: string[]): Promise<void> {
  const { remaining, repoPath } = resolveRepoPath(args);
  const convoyRepoPath = resolveConvoyRoot(repoPath);
  const hostPaths = getAgentHostPaths();

  // WS-1: auto-register the CWD repo into config.repos so target-repo
  // resolution works for any dev, not just the convoy creator.
  autoRegisterCwdRepo(repoPath);

  // ── Git pull: sync latest state before reading ──
  const behaviors = loadBehaviors(convoyRepoPath);
  if (behaviors.context.auto_pull) {
    gitPull(convoyRepoPath);
  }

  // ── Auto-build: rebuild CLI if behaviors say so ──
  if (behaviors.context.auto_build) {
    try {
      const cliDir = path.join(convoyRepoPath, 'cli');
      if (fs.existsSync(path.join(cliDir, 'package.json'))) {
        execSync('npm run build', { cwd: cliDir, stdio: 'pipe', timeout: 30000 });
      }
    } catch {
      console.warn('  [build] warn: auto-build failed — using existing build');
    }
  }

  // ── Auto-install bundled skills + agents ──
  //
  // Copy bundled launcher skills (and agents) from this repo's .claude/
  // into host skill homes (Claude, Codex, etc.) when those hosts are active
  // or already present. This writes only conduit-* skills and never deletes
  // host-local files.
  let bundledSkillResults: BundledSkillInstallResult[] = [];
  let bundledAgentResults: BundledAgentInstallResult[] = [];
  if (behaviors.context.auto_install_skills) {
    try {
      bundledSkillResults = syncBundledSkillsToTargets(convoyRepoPath);
    } catch {
      // Bundled-skill copy failure must not block context loading.
    }

    try {
      bundledAgentResults = syncBundledAgentsToTargets(convoyRepoPath);
    } catch {
      // Bundled-agent copy failure must not block context loading.
    }
  }

  let convoyId = remaining[0];
  if (convoyId) validateConvoyId(convoyId);
  if (!convoyId) {
    const all = scanActiveConvoys(convoyRepoPath);
    const active = all.filter(c => c.status === 'active');
    const paused = all.filter(c => c.status === 'paused');

    if (active.length === 0 && paused.length === 0) {
      console.log('No active convoy found. Standard Mode.');
      console.log('  Start a convoy:  conduit convoy new --title "..." --id "..." --work-item "..."');
      return;
    }
    if (active.length === 0 && paused.length > 0) {
      console.log('No active convoy — paused convoys:');
      for (const c of paused) console.log(`  ${c.id}  (paused)  →  conduit convoy resume ${c.id}`);
      return;
    }
    convoyId = active[0].id;
    if (paused.length > 0) {
      console.log(`Note: ${paused.length} paused convoy(s): ${paused.map(c => c.id).join(', ')}`);
      console.log('');
    }
  }

  const convoyRoot = path.join(convoyRepoPath, 'convoys', 'active', convoyId);
  const yamlPath = path.join(convoyRoot, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) throw new Error(`convoy ${convoyId} not found in convoys/active/`);

  const yaml = fs.readFileSync(yamlPath, 'utf-8');
  const title    = parseYamlField(yaml, 'title');
  const stage    = parseInt(parseYamlField(yaml, 'stage') || '0', 10);
  const status   = parseYamlField(yaml, 'status');
  const workType = parseYamlField(yaml, 'work_type');
  const workItem = parseYamlField(yaml, 'work_item');
  const featureBranch = parseMetaField(yaml, 'feature_branch');
  const prUrl         = parseMetaField(yaml, 'pr_url');
  const workstreams = parseWorkstreams(yaml);

  // Gate state (read from events.jsonl, filter for gate event types)
  const GATE_TYPES = new Set(['gate_requested', 'gate_passed', 'gate_rejected', 'gate_evaluation', 'gate_skipped']);
  // Display-only path — see status.ts for rationale on the 200-event tail.
  const gateEvents = readConvoyEvents(convoyRoot, { last: 200 })
    .filter(e => GATE_TYPES.has(e.type))
    .map(e => ({
      ts: e.ts,
      type: e.type as GateEvent['type'],
      convoy: e.convoy,
      gate: e.gate ?? '',
      stage: e.stage ?? 0,
      approver: e.approver ?? '',
      reason: e.reason,
      verdict: undefined as GateEvent['verdict'],
    }));
  const lastGate     = gateEvents.length > 0 ? gateEvents[gateEvents.length - 1] : null;
  const recentEval   = [...gateEvents].reverse().find(e => e.type === 'gate_evaluation');
  const recentRequest = [...gateEvents].reverse().find(e => e.type === 'gate_requested');
  const lastApproval = [...gateEvents].reverse().find(e => e.type === 'gate_passed');

  // Checkpoints
  const jsonlPath = path.join(repoPath, DEFAULT_JSONL_PATH);
  const all   = readLatest(readJSONL(jsonlPath));
  const mine  = filterByWorkstream(all, convoyId);
  const passed  = mine.filter(r => r.status === 'passed').length;
  const failed  = mine.filter(r => r.status === 'failed').length;
  const pending = mine.filter(r => r.status === 'pending').length;

  // Stage directive (directives live in the convoy repo)
  const directiveRelPath = findDirectivePath(convoyRepoPath, workType, stage);
  const directiveAbsPath = directiveRelPath ? path.join(convoyRepoPath, directiveRelPath) : '';
  const stageProduces = extractStageProduces(directiveAbsPath);

  // Context files
  const hasLivingSpec  = fs.existsSync(path.join(convoyRoot, 'living-spec.md'));
  const hasAcceptance  = (() => {
    const wsDir = path.join(convoyRoot, 'workstreams');
    if (!fs.existsSync(wsDir)) return false;
    return fs.readdirSync(wsDir).some(ws => fs.existsSync(path.join(wsDir, ws, 'ACCEPTANCE.md')));
  })();
  const hasGateContext = fs.existsSync(path.join(convoyRoot, 'audit', `gate-context-${stage}.md`));

  // ── Next action determination ──
  type Action = { cmd: string; note: string };
  const nextActions: Action[] = [];
  if (recentEval?.verdict === 'SEND_BACK') {
    nextActions.push({ cmd: `conduit gate request ${convoyId} gate-${stage} --request <file>`, note: 'Resolve SEND_BACK findings, then re-evaluate' });
    nextActions.push({ cmd: `conduit gate skip ${convoyId} gate-${stage} --reason "..."`, note: 'Skip gate with documented reason (requires human confirmation)' });
  } else if (recentEval?.verdict === 'APPROVE') {
    nextActions.push({ cmd: `conduit gate approve ${convoyId} gate-${stage}`, note: 'Record human approval and advance to Stage ' + (stage + 1) });
    nextActions.push({ cmd: `conduit gate reject ${convoyId} gate-${stage}`, note: 'Record rejection — stage unchanged' });
  } else if (recentEval?.verdict === 'ESCALATE') {
    nextActions.push({ cmd: `(escalate to named contact — see ESCALATE findings)`, note: 'Human must resolve escalation before gate can proceed' });
  } else if (recentRequest && !recentEval) {
    nextActions.push({ cmd: `(read audit/gate-context-${stage}.md in ${agentName()} and apply gate-evaluator.md)`, note: `Context assembled — ${agentName()} evaluation pending in conversation` });
    nextActions.push({ cmd: `conduit gate approve ${convoyId} gate-${stage}`, note: `After ${agentName()} evaluation, record approval` });
    nextActions.push({ cmd: `conduit gate skip ${convoyId} gate-${stage} --reason "..."`, note: 'Or skip with documented reason' });
  } else if (lastApproval) {
    nextActions.push({ cmd: `conduit gate request ${convoyId} gate-${stage} --request <file>`, note: 'Evaluate stage work before requesting human approval' });
    nextActions.push({ cmd: `conduit checkpoint create <workstream> "<title>"`, note: 'Record a checkpoint for completed work' });
  } else {
    nextActions.push({ cmd: `conduit gate request ${convoyId} gate-${stage} --request <file>`, note: 'No gate evaluation run yet — required before gate decision' });
  }

  // ── Output ──
  const RULE = '━'.repeat(62);
  console.log(RULE);
  console.log('CONDUIT SESSION CONTEXT');
  console.log(`Convoy:  ${convoyId}`);
  if (title) console.log(`Title:   ${title}`);
  console.log(`Stage:   ${stage} — ${stageName(stage)}`);
  console.log(`Status:  ${status}   Work type: ${workType || '(not set)'}`);
  if (workItem) console.log(`Work item: ${workItem}`);
  if (featureBranch) console.log(`Branch:  ${featureBranch}`);
  if (prUrl) console.log(`PR:      ${prUrl}`);
  console.log(RULE);

  console.log('');
  console.log('STAGE DIRECTIVE');
  if (directiveRelPath) {
    console.log(`  ${directiveRelPath}`);
    if (stageProduces.length > 0) {
      console.log('  This stage produces:');
      for (const line of stageProduces) console.log(`    ${line}`);
    }
  } else {
    console.log('  (no directive found — check work_type in convoy.yaml)');
  }

  if (workstreams.length > 0) {
    console.log('');
    const doneCount = workstreams.filter(ws => ws.status === 'complete').length;
    const progress = doneCount > 0 ? `  (${doneCount}/${workstreams.length} complete)` : '';
    console.log(`WORKSTREAMS${progress}`);
    for (const ws of workstreams) {
      const marker = ws.status === 'complete' ? '✓' : ws.status === 'in_progress' ? '→' : '·';
      const titleStr = ws.title ? `  ${ws.title.length > 52 ? ws.title.slice(0, 49) + '…' : ws.title}` : '';
      const branchStr = ws.branch ? `  [${ws.branch}]` : '';
      const repoStr = ws.repoSlug ? `  repo:${ws.repoSlug}` : '';
      console.log(`  ${marker}  ${ws.id.padEnd(6)}${titleStr}${repoStr}${branchStr}`);
    }
  }

  console.log('');
  console.log('GATE STATE');
  if (recentEval) {
    const verdictPad = recentEval.verdict?.padEnd(12) ?? '';
    console.log(`  Last evaluation:  gate-${recentEval.gate}   ${verdictPad}   ${recentEval.ts.slice(0, 10)}`);
    if (hasGateContext) console.log(`  Context file:     audit/gate-context-${stage}.md`);
  } else if (recentRequest) {
    console.log(`  Context assembled: gate-${recentRequest.gate}   ${recentRequest.ts.slice(0, 10)}`);
    if (hasGateContext) console.log(`  Context file:      audit/gate-context-${stage}.md  ← read this in ${agentName()}`);
    console.log(`  Verdict:           PENDING — ${agentName()} evaluation not yet recorded`);
  } else if (lastGate) {
    console.log(`  ${lastGate.type.padEnd(20)}   gate-${lastGate.gate}   ${lastGate.ts.slice(0, 10)}`);
  } else {
    console.log('  No gate events recorded yet.');
  }
  if (lastApproval) {
    console.log(`  Last approval:    gate-${lastApproval.gate}   stage ${lastApproval.stage} → ${lastApproval.stage + 1}   ${lastApproval.ts.slice(0, 10)}`);
  }

  console.log('');
  console.log('CHECKPOINTS');
  if (passed + failed + pending > 0) {
    console.log(`  ${passed} passed   ${failed} failed   ${pending} pending`);
    for (const r of mine.filter(c => c.status !== 'passed')) {
      console.log(`  [${r.status}]  ${r.id}  ${r.title ?? ''}`);
    }
  } else {
    console.log('  None recorded.');
  }

  console.log('');
  console.log('CONTEXT FILES  (token estimates for context window budgeting)');

  // Token counts for key context files
  const specPath = path.join(convoyRoot, 'living-spec.md');
  const specTokens = hasLivingSpec ? estimateTokens(fs.readFileSync(specPath, 'utf-8')) : 0;
  const specStatus = hasLivingSpec ? `✓  ${formatTokens(specTokens)}` : '✗ MISSING';

  let acTokens = 0;
  if (hasAcceptance) {
    const wsDir = path.join(convoyRoot, 'workstreams');
    for (const ws of fs.readdirSync(wsDir)) {
      const acPath = path.join(wsDir, ws, 'ACCEPTANCE.md');
      if (fs.existsSync(acPath)) acTokens += estimateTokens(fs.readFileSync(acPath, 'utf-8'));
    }
  }
  const acStatus = hasAcceptance ? `✓  ${formatTokens(acTokens)}` : '✗ MISSING';

  const evaluatorPath = path.join(convoyRepoPath, 'directives', 'shared', 'gate-evaluator.md');
  const evaluatorTokens = fs.existsSync(evaluatorPath) ? estimateTokens(fs.readFileSync(evaluatorPath, 'utf-8')) : 0;

  const behaviorPath = path.join(convoyRepoPath, 'directives', 'shared', 'convoy-agent-behavior.md');
  const behaviorTokens = fs.existsSync(behaviorPath) ? estimateTokens(fs.readFileSync(behaviorPath, 'utf-8')) : 0;

  const directiveTokens = directiveAbsPath && fs.existsSync(directiveAbsPath) ? estimateTokens(fs.readFileSync(directiveAbsPath, 'utf-8')) : 0;

  const gateContextPath = path.join(convoyRoot, 'audit', `gate-context-${stage}.md`);
  const gateContextTokens = fs.existsSync(gateContextPath) ? estimateTokens(fs.readFileSync(gateContextPath, 'utf-8')) : 0;
  const contextEntries = [
    { label: 'living-spec.md', tokens: specTokens, present: hasLivingSpec },
    { label: 'workstreams/*/ACCEPTANCE.md', tokens: acTokens, present: hasAcceptance },
    { label: 'directives/shared/gate-evaluator.md', tokens: evaluatorTokens, present: fs.existsSync(evaluatorPath) },
    { label: 'directives/shared/convoy-agent-behavior.md', tokens: behaviorTokens, present: fs.existsSync(behaviorPath) },
    { label: directiveRelPath || '(no stage directive)', tokens: directiveTokens, present: Boolean(directiveRelPath) && fs.existsSync(directiveAbsPath) },
    { label: `audit/gate-context-${stage}.md`, tokens: gateContextTokens, present: gateContextTokens > 0 },
  ].filter(entry => entry.present && entry.tokens > 0);

  console.log(`  living-spec.md                           ${specStatus}`);
  console.log(`  workstreams/*/ACCEPTANCE.md              ${acStatus}`);
  console.log(`  directives/shared/gate-evaluator.md      ✓  ${formatTokens(evaluatorTokens)}`);
  console.log(`  directives/shared/convoy-agent-behavior.md  ✓  ${formatTokens(behaviorTokens)}`);
  if (directiveRelPath) {
    console.log(`  ${directiveRelPath.padEnd(43)} ${formatTokens(directiveTokens)}`);
  }
  if (gateContextTokens > 0) {
    console.log(`  audit/gate-context-${stage}.md${' '.repeat(Math.max(1, 30 - String(stage).length))} ${formatTokens(gateContextTokens)}`);
  }

  const totalContextTokens = specTokens + acTokens + evaluatorTokens + behaviorTokens + directiveTokens + gateContextTokens;
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  Total context budget:                    ${formatTokens(totalContextTokens)}`);
  const largestContextInputs = [...contextEntries].sort((a, b) => b.tokens - a.tokens).slice(0, 3);
  if (largestContextInputs.length > 0) {
    console.log(`  Largest inputs:                          ${largestContextInputs.map(e => `${e.label} ${formatTokens(e.tokens)}`).join('; ')}`);
  }
  const budgetPosture = totalContextTokens >= 60000
    ? 'HIGH — summarize stale/large files before adding more context'
    : totalContextTokens >= 30000
      ? 'ELEVATED — prefer targeted reads and update handoff notes'
      : 'OK — still re-read only what changed';
  console.log(`  Budget posture:                          ${budgetPosture}`);

  const freshnessChecks = [
    { label: 'living-spec.md', path: specPath, warnDays: 14 },
    { label: `audit/gate-context-${stage}.md`, path: gateContextPath, warnDays: 7 },
  ];
  const staleContextFiles = freshnessChecks
    .filter(entry => fs.existsSync(entry.path))
    .map(entry => ({
      label: entry.label,
      days: Math.floor((Date.now() - fs.statSync(entry.path).mtimeMs) / 86400000),
      warnDays: entry.warnDays,
    }))
    .filter(entry => entry.days > entry.warnDays);
  if (staleContextFiles.length > 0) {
    console.log(`  Context freshness:                       ${staleContextFiles.map(e => `${e.label} ${e.days}d old`).join('; ')}`);
  }

  // ── Repo Signals Surfacing (progressive enrichment) ──
  // Show CONDUIT.md signals for each workstream repo so the user can verify
  const wsRepos = new Set(workstreams.map(ws => ws.repoSlug).filter(Boolean));
  if (wsRepos.size > 0) {
    console.log('');
    console.log('REPO SIGNALS  (from CONDUIT.md — verify these are current)');
    const parentDir = path.dirname(convoyRepoPath);
    for (const repoSlug of wsRepos) {
      const repoConduitMd = path.join(parentDir, repoSlug, 'CONDUIT.md');
      if (!fs.existsSync(repoConduitMd)) {
        console.log(`  ${repoSlug}: ⚠ NO CONDUIT.md — run: conduit init ${path.join(parentDir, repoSlug)} --scan`);
        continue;
      }
      const content = fs.readFileSync(repoConduitMd, 'utf-8');
      const statusMatch = content.match(/operational_status:\s*(\S+)/);
      const classMatch = content.match(/system_class:\s*(\S+)/);
      const ownerMatch = content.match(/escalation_contacts:[\s\S]*?owner:\s*["']?([^"'\n]+)["']?/);
      const lastUpdateMatch = content.match(/last_context_update:\s*["']?([^"'\n]+)["']?/);

      const opStatus = statusMatch?.[1] ?? 'unknown';
      const sysClass = classMatch?.[1] ?? 'unknown';
      const owner = ownerMatch?.[1]?.trim() ?? 'unknown';
      const lastUpdate = lastUpdateMatch?.[1]?.trim() ?? '';
      const age = daysSince(lastUpdate);
      const staleFlag = age > 30 ? '  ⚠ STALE' : '';

      // Content signals
      const aiInputMatch = content.match(/ai_input:\s*(\S+)/);
      const aiModifyMatch = content.match(/ai_modify:\s*(\S+)/);
      const aiTrainMatch = content.match(/ai_train:\s*(\S+)/);
      const hasContentSignals = aiInputMatch || aiModifyMatch || aiTrainMatch;
      const csStr = hasContentSignals
        ? `  signals: input=${aiInputMatch?.[1] ?? '—'} modify=${aiModifyMatch?.[1] ?? '—'} train=${aiTrainMatch?.[1] ?? '—'}`
        : '';

      console.log(`  ${repoSlug.padEnd(24)} ${opStatus.padEnd(12)} ${sysClass.padEnd(10)} owner: ${owner}${staleFlag}`);
      if (hasContentSignals) {
        console.log(`    └─ content_signals: ai_input=${aiInputMatch?.[1] ?? '—'}  ai_modify=${aiModifyMatch?.[1] ?? '—'}  ai_train=${aiTrainMatch?.[1] ?? '—'}`);
      }
      const offer = formatReenrichmentOffer(lastUpdate, path.join(parentDir, repoSlug));
      if (age > 30) {
        if (offer) console.log(`    re-enrichment: ${offer}`);
        console.log(`    └─ last_context_update: ${lastUpdate} (${age} days ago) — CONTEXT.md may be outdated`);
      }
    }
    console.log('');
    console.log('  ℹ If anything above is wrong, edit the repo\'s CONDUIT.md directly.');
    console.log('    Conduit uses these signals for permissions, routing, and gate decisions.');
  }

  const changedSkillTargets = bundledSkillResults
    .filter(r => r.installed > 0 || r.updated > 0 || r.errors.length > 0);
  const changedAgentTargets = bundledAgentResults
    .filter(r => r.installed > 0 || r.updated > 0 || r.errors.length > 0);
  if (changedSkillTargets.length > 0 || changedAgentTargets.length > 0) {
    console.log('');
    console.log('WORKFLOW SURFACES');
    for (const r of changedSkillTargets) {
      const changed = r.installed + r.updated;
      const summary = `${changed} refreshed (${r.installed} new, ${r.updated} updated)`;
      console.log(`  Skills   ${r.target.label.padEnd(8)} ${summary} -> ${r.target.skillsDir}`);
      for (const err of r.errors.slice(0, 3)) console.log(`    warning: ${err}`);
      if (r.errors.length > 3) console.log(`    warning: ${r.errors.length - 3} more install issue(s) omitted`);
    }
    for (const r of changedAgentTargets) {
      const changed = r.installed + r.updated;
      const summary = `${changed} refreshed (${r.installed} new, ${r.updated} updated)`;
      console.log(`  Agents   ${r.target.label.padEnd(8)} ${summary} -> ${r.target.agentsDir}`);
      for (const err of r.errors.slice(0, 3)) console.log(`    warning: ${err}`);
      if (r.errors.length > 3) console.log(`    warning: ${r.errors.length - 3} more install issue(s) omitted`);
    }
  }

  console.log('');
  console.log('NEXT ACTIONS');
  for (const a of nextActions) {
    console.log(`  ${a.cmd}`);
    console.log(`    ↳ ${a.note}`);
  }

  console.log('');
  console.log(`AGENTIC NOTES  (for ${agentName()})`);
  console.log(`  active host      → ${agentHostLabel(hostPaths.host)} (${hostPaths.source}); workflow surface: ${hostWorkflowSurface(hostPaths.host)}`);
  console.log('  git worktrees     → your host\'s isolation primitive (Claude Code: Agent with isolation:"worktree"; Codex CLI: child agent task) — risky or experimental work');
  console.log('  parallel agents   → your host\'s parallel-agent primitive (Claude Code: multiple Agent calls in one message; Codex CLI: concurrent child tasks) — multi-file or multi-repo work');
  console.log('  workflows         → bundled conduit-* skills are synced to detected host skill homes when auto_install_skills is enabled');
  console.log('  conduit sync      → refresh repo/registry state before gate evaluations');
  console.log('  conduit context   → re-run this command to refresh the operating picture');
  console.log('');
  console.log('  Rules:');
  console.log('    Never advance stage without explicit human gate decision.');
  console.log('    Never treat external work-item closure as gate approval.');
  console.log('    Surface SEND_BACK findings before requesting human approval.');
  console.log('');
}
