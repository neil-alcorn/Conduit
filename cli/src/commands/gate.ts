// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/gate.ts
// description: Gate command group — eval, approve, reject, request with audit log writing.
//              Headless: approve/reject/skip refused (exit 2); eval emits JSON,
//              SEND_BACK → exit 10 (headless-protocol §c/§d).
// owner:       BOTH
// update:      Manual as gate behavior changes.
// schema:      none
// last_update: 2026-06-15
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkPermission } from '../internal/signals.js';
import { resolveRepoPath, resolveConvoyRoot, resolveTargetRepoPath, parseFlagValue, currentActor, readPrompt, validateConvoyId } from '../utils.js';
import { appendConvoyEvent, readConvoyEvents } from '../internal/convoy-events.js';
import { updateConvoyRegistryStage } from './convoy.js';
import { readJSONL, readLatest, filterByWorkstream, DEFAULT_JSONL_PATH } from '../internal/checkpoint.js';
import { daysSince, STALE_DAYS } from '../internal/staleness.js';
import { parseSignalsFromFile } from '../internal/signals.js';
import { gitSync, isCommittedAndClean, commitAndPushPathspecs, isGitRepo, assertApprovablePush, pushApproveToMaster } from '../internal/git-sync.js';
import { appendDecision } from '../internal/decisions.js';
import { extractMarkdownLinks, filterAuditLinks } from '../internal/markdown-links.js';
import { loadBehaviors } from '../internal/behaviors.js';
import { estimateTokens, formatTokens } from '../internal/tokens.js';
import { agentName } from '../internal/agent-name.js';
import { updateConvoyYaml } from '../internal/convoy-yaml.js';
import { isHeadless, MissingContextFieldError } from '../internal/headless-io.js';
import { headlessOutput, headlessError, headlessEvent } from '../internal/headless-output.js';

function emitLearningCheck(trigger: 'gate_request', convoyId: string, stage: number): void {
  const data = {
    trigger,
    convoy_id: convoyId,
    stage,
    message: 'Review whether this work produced a reusable repo skill, rule, or decision learning. If yes, run conduit learn with --evidence.',
  };
  if (isHeadless()) {
    headlessEvent('learning_check', data);
    return;
  }
  console.log('');
  console.log('LEARNING CHECK');
  console.log(`  If this gate surfaced reusable guidance, run: conduit learn <skill|rule> --convoy ${convoyId} --evidence <artifact>`);
}

function convoyYamlPath(repoPath: string, convoyId: string): string {
  return path.join(repoPath, 'convoys', 'active', convoyId, 'convoy.yaml');
}

function convoyRootPath(repoPath: string, convoyId: string): string {
  return path.join(repoPath, 'convoys', 'active', convoyId);
}

function readStage(yamlPath: string): number {
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const match = content.match(/^stage:\s*(\d+)/m);
  return match ? parseInt(match[1], 10) : 0;
}

// AC-19 (BUG-3): parse-modify-serialize — never regex-template the stage line.
function incrementStage(yamlPath: string): number {
  let result = 0;
  updateConvoyYaml(yamlPath, doc => {
    const raw = doc['stage'];
    const current = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(current)) return; // no stage field — preserve historical no-op
    const newStage = current + 1;
    if (newStage > 8) throw new Error(`CONDUIT: cannot increment stage past maximum of 8 (current: ${current})`);
    doc['stage'] = newStage;
    result = newStage;
  });
  return result;
}

// ── Append a gate_history entry to convoy.yaml ──
// AC-19 (BUG-3): the gate name is user-supplied argv — parse-modify-serialize
// so a payload like "gate-x\nstage: 8" stays contained in its field.
function appendGateHistory(yamlPath: string, gate: string, decision: string, date: string): void {
  updateConvoyYaml(yamlPath, doc => {
    const history = Array.isArray(doc['gate_history']) ? doc['gate_history'] as unknown[] : [];
    history.push({ gate, decision, date });
    doc['gate_history'] = history;
  });
}

// ── Sync workstream stages to match convoy stage ──
// AC-19 (BUG-3): operate on the parsed workstreams list, not raw lines.
function syncWorkstreamStages(yamlPath: string, newStage: number): void {
  updateConvoyYaml(yamlPath, doc => {
    const workstreams = doc['workstreams'];
    if (!Array.isArray(workstreams)) return;
    for (const entry of workstreams) {
      if (entry === null || typeof entry !== 'object') continue;
      const ws = entry as Record<string, unknown>;
      const current = typeof ws['stage'] === 'number' ? ws['stage'] as number : NaN;
      if (Number.isFinite(current) && current < newStage) {
        ws['stage'] = newStage;
      }
    }
  });
}

// ── Resolve the stage directive path for a given work_type and stage number ──
export function stageDirectivePath(repoPath: string, workType: string, stage: number): string {
  const prefix = String(stage).padStart(2, '0');

  const stageDir = path.join(repoPath, 'directives', workType, 'stages');
  if (!fs.existsSync(stageDir)) return '';
  const files = fs.readdirSync(stageDir).sort();
  const match = files.find(f => f.startsWith(prefix + '-'));
  return match ? path.join(stageDir, match) : '';
}

// ── Read work_type from convoy YAML ──
function readWorkType(yamlPath: string): string {
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const match = content.match(/^work_type:\s*["']?([a-z_-]+)["']?/m);
  return match ? match[1] : 'net-new';
}

// ── Extract Gate Criteria section from a stage directive ──
function extractGateCriteria(directiveContent: string, stage: number): string {
  const heading = `## Gate ${stage} Criteria`;
  const idx = directiveContent.indexOf(heading);
  if (idx === -1) return '';
  // grab from heading to next ## heading or end-of-file
  const rest = directiveContent.slice(idx);
  const nextSection = rest.slice(heading.length).search(/^## /m);
  return nextSection === -1 ? rest : rest.slice(0, heading.length + nextSection);
}

// ── Map convoy work_type to directives folder name ──
function directiveWorkType(workType: string): string {
  const map: Record<string, string> = {
    feature: 'net-new',
    'net-new': 'net-new',
    enhancement: 'enhancement',
    bug: 'bug-fix',
    'bug-fix': 'bug-fix',
    maintenance: 'maintenance',
  };
  return map[workType] ?? 'net-new';
}

export async function runGate(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit gate <eval|approve|reject|request|skip> [convoy-id] [gate-type] [--repo path]');
    return;
  }

  const subcommand = args[0];

  // AC-5 (headless-protocol §d): gates are human-only. The refusal is a
  // deterministic CLI-layer check at the TOP of the dispatch — before any
  // permission read, file access, or state mutation — so a pipeline can
  // never approve its own gates. request and eval stay allowed (AC-6/7).
  if (isHeadless() && (subcommand === 'approve' || subcommand === 'reject' || subcommand === 'skip')) {
    headlessError('gate-mutation-refused', {
      message: 'Gate approvals are human-only; headless mode can only request gates',
    });
    process.exit(2);
  }

  const { remaining, repoPath } = resolveRepoPath(args.slice(1));
  const convoyRepoPath = resolveConvoyRoot(repoPath);

  switch (subcommand) {
    case 'eval': {
      checkPermission(repoPath, 'read');
      if (remaining.length < 2) throw new Error('usage: conduit gate eval [convoy-id] [gate-type]');
      const [convoyId, gateType] = remaining;
      validateConvoyId(convoyId);
      const yamlPath = convoyYamlPath(convoyRepoPath, convoyId);
      if (!fs.existsSync(yamlPath)) throw new Error(`convoy ${convoyId} not found in convoys/active/`);
      const stage = readStage(yamlPath);

      const jsonlPath = path.join(repoPath, DEFAULT_JSONL_PATH);
      const checkpoints = filterByWorkstream(readLatest(readJSONL(jsonlPath)), convoyId);
      const passed = checkpoints.filter(r => r.status === 'passed').length;
      const failed = checkpoints.filter(r => r.status === 'failed').length;
      const pending = checkpoints.filter(r => r.status === 'pending').length;

      let staleWarning: string | undefined;
      const conduitMdPath = path.join(repoPath, 'CONDUIT.md');
      if (fs.existsSync(conduitMdPath)) {
        try {
          const signals = parseSignalsFromFile(conduitMdPath);
          const age = daysSince(signals.last_context_update);
          if (age > STALE_DAYS) {
            staleWarning = `CONTEXT.md last updated ${age} days ago — consider refreshing`;
          }
        } catch { /* malformed CONDUIT.md — skip staleness check */ }
      }

      // AC-7/AC-8: headless eval is allowed (advisory, no mutation) and emits
      // the evaluation as JSON. Verdict is the CLI's deterministic slice of
      // the gate evaluation: any failed checkpoint → SEND_BACK → exit 10 so
      // pipelines can branch; the agent-layer report supplies the judgment.
      if (isHeadless()) {
        if (staleWarning) headlessEvent('warning', { message: staleWarning });
        const verdict = failed > 0 ? 'SEND_BACK' : 'SUCCESS';
        headlessOutput({
          command: 'gate eval',
          convoy_id: convoyId,
          verdict,
          gate: gateType,
          stage,
          checkpoints: { passed, failed, pending },
          artifacts: [],
        });
        if (verdict === 'SEND_BACK') process.exit(10);
        return;
      }

      console.log(`CONDUIT GATE EVAL: ${convoyId} / ${gateType}`);
      console.log(`  Current stage: ${stage}`);
      console.log(`  Checkpoints:   ${passed} passed  ${failed} failed  ${pending} pending`);
      if (staleWarning) console.log(`  warn: ${staleWarning}`);
      return;
    }

    case 'approve': {
      checkPermission(repoPath, 'write');
      if (remaining.length < 2) throw new Error('usage: conduit gate approve [convoy-id] [gate-type] [--skip-request]');
      const skipRequest = remaining.includes('--skip-request');
      const approveArgs = remaining.filter(a => a !== '--skip-request');
      const [convoyId, gateType] = approveArgs;
      validateConvoyId(convoyId);
      const yamlPath = convoyYamlPath(convoyRepoPath, convoyId);
      if (!fs.existsSync(yamlPath)) throw new Error(`convoy ${convoyId} not found in convoys/active/`);
      const prevStage = readStage(yamlPath);
      const convoyRoot = convoyRootPath(convoyRepoPath, convoyId);

      // Defect #1 (Stage 2): fail-fast hybrid preflight. Refuse to start the
      // approve flow if HEAD's branch state would silently route the push to
      // the wrong remote ref. Throws GateApproveBranchError when neither
      // (a) HEAD is master, nor (b) origin/master is an ancestor of HEAD.
      assertApprovablePush(convoyRepoPath);

      // Advisory: warn about PR merge verification when advancing past Stage 4
      if (prevStage === 4) {
        const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
        const prUrlMatches = [...yamlContent.matchAll(/^\s+pr_url:\s*["']?([^"'\n]+)["']?/gm)];
        const hasPR = prUrlMatches.some(m => m[1]?.trim());
        if (hasPR) {
          console.log('Note: verify PR is merged before proceeding with Stage 5 work.');
        }
      }

      // Guard: validate gate type matches current stage
      const gateNum = parseInt(gateType.replace(/^gate-?/, ''), 10);
      if (!isNaN(gateNum) && gateNum !== prevStage) {
        throw new Error(`gate type ${gateType} does not match current stage ${prevStage} — cannot approve gate for a different stage`);
      }

      // Guard: idempotency — check if this gate was already approved (reads events.jsonl)
      const convoyEvents = readConvoyEvents(convoyRoot);
      let hasGateRequest = false;
      for (const entry of convoyEvents) {
        if (entry.type === 'gate_passed' && entry.stage === prevStage) {
          throw new Error(`gate for stage ${prevStage} was already approved — cannot approve twice. Use 'conduit gate eval' to check current state.`);
        }
        if (entry.type === 'gate_requested' && entry.stage === prevStage) {
          hasGateRequest = true;
        }
      }

      const actor = currentActor();

      // Guard: require gate_requested before approve (Deming Point 3 — build quality into process)
      if (!hasGateRequest) {
        if (skipRequest) {
          const skipTs = new Date().toISOString();
          appendConvoyEvent(
            { ts: skipTs, type: 'gate_requested', convoy: convoyId, gate: gateType, stage: prevStage, approver: actor },
            convoyRoot
          );
          console.log(`  note: gate request auto-generated (--skip-request). Evaluation occurred in conversation.`);
        } else {
          throw new Error(
            `no gate_requested event found for stage ${prevStage}. ` +
            `Run 'conduit gate request ${convoyId} ${gateType}' first to assemble and evaluate the gate context. ` +
            `If the evaluation was done in conversation, use --skip-request to bypass.`
          );
        }
      }

      // Four-eyes principle: requester and approver must differ at gates 3 and 5 (AC-5, AC-6)
      if (prevStage === 3 || prevStage === 5) {
        const requestEvent = [...convoyEvents].reverse().find(e => e.type === 'gate_requested' && e.stage === prevStage);
        if (requestEvent && requestEvent.approver === actor) {
          throw new Error(
            `CONDUIT: four-eyes required — gate requester and approver must be different at Gate ${prevStage}. ` +
            `Requester: ${requestEvent.approver}, Current actor: ${actor}. ` +
            `A different team member must run 'conduit gate approve'.`
          );
        }
      }

      // Log review period (AC-7)
      {
        const requestEvent = [...convoyEvents].reverse().find(e => e.type === 'gate_requested' && e.stage === prevStage);
        if (requestEvent) {
          const requestTime = new Date(requestEvent.ts).getTime();
          const approveTime = Date.now();
          const elapsedSec = Math.round((approveTime - requestTime) / 1000);
          if (elapsedSec < 60) {
            console.log(`  warn: gate approved within ${elapsedSec}s of request — review time logged`);
          }
        }
      }

      // Gate 8 is the final gate — don't increment, just record the approval
      const isFinalGate = prevStage === 8;
      let newStage: number;
      if (isFinalGate) {
        newStage = 8; // stay at 8 — convoy close handles the rest
      } else {
        try {
          newStage = incrementStage(yamlPath);
        } catch (err: any) {
          throw new Error(`CONDUIT: failed to increment stage in ${yamlPath} — ${err.message}`);
        }
      }
      const ts = new Date().toISOString();
      const dateStr = ts.split('T')[0];

      // Compute spec hash at Gate 2 for integrity checking at Gate 3
      let specHash: string | undefined;
      if (prevStage === 2) {
        const specPath = path.join(convoyRoot, 'living-spec.md');
        if (fs.existsSync(specPath)) {
          const specContent = fs.readFileSync(specPath, 'utf-8');
          specHash = crypto.createHash('sha256').update(specContent).digest('hex');
        }
      }

      try {
        appendConvoyEvent(
          { ts, type: 'gate_passed', convoy: convoyId, gate: gateType, stage: prevStage, approver: actor, ...(specHash ? { details: { spec_hash: specHash } } : {}) },
          convoyRoot
        );
        appendConvoyEvent(
          { ts, type: 'stage_started', convoy: convoyId, stage: newStage },
          convoyRoot
        );
      } catch (err: any) {
        throw new Error(`CONDUIT: failed to write convoy event after stage increment (stage now ${newStage}) — ${err.message}`);
      }

      try {
        // Write gate_history entry in convoy.yaml
        appendGateHistory(yamlPath, gateType, 'approve', dateStr);
      } catch (err: any) {
        throw new Error(`CONDUIT: failed to write gate_history to convoy.yaml (stage now ${newStage}) — ${err.message}`);
      }

      try {
        // Advance workstream stages to match convoy stage
        syncWorkstreamStages(yamlPath, newStage);
      } catch (err: any) {
        throw new Error(`CONDUIT: failed to sync workstream stages (stage now ${newStage}) — ${err.message}`);
      }

      try {
        // Sync registry with new stage (prevents registry drift)
        updateConvoyRegistryStage(convoyRepoPath, convoyId, newStage);
      } catch (err: any) {
        throw new Error(`CONDUIT: failed to update convoy registry stage (stage now ${newStage}) — ${err.message}`);
      }

      // ── Git sync: commit convoy state changes ──
      const behaviors = loadBehaviors(convoyRepoPath);
      if (behaviors.gate_approve.auto_commit) {
        const approveFiles = [
          path.relative(convoyRepoPath, yamlPath),
          path.join('convoys', 'active', convoyId, 'events.jsonl'),
          'convoys/registry.yaml',
        ];
        // Defect #1 (Stage 2): commit locally without push, then explicitly
        // push HEAD:master so the approval lands on origin/master regardless
        // of whether the local branch is master or a fresh approve-branch.
        // assertApprovablePush() already ran at the top of this case.
        gitSync(convoyRepoPath, approveFiles, `conduit: gate-${prevStage} approved ${convoyId} — advance to stage ${newStage}`, { push: false });
        if (behaviors.gate_approve.auto_push) {
          const ok = pushApproveToMaster(convoyRepoPath);
          if (ok) console.log(`  [git] pushed to remote`);
        }
      }

      console.log(`CONDUIT: gate ${gateType} approved for ${convoyId} — now at stage ${newStage}`);
      return;
    }

    case 'reject': {
      checkPermission(repoPath, 'write');
      if (remaining.length < 2) throw new Error('usage: conduit gate reject [convoy-id] [gate-type] [--reason "..."]');
      const [convoyId, gateType, ...rest] = remaining;
      validateConvoyId(convoyId);
      const yamlPath = convoyYamlPath(convoyRepoPath, convoyId);
      if (!fs.existsSync(yamlPath)) throw new Error(`convoy ${convoyId} not found in convoys/active/`);
      const stage = readStage(yamlPath);
      const { value: flagReason } = parseFlagValue(rest, '--reason');
      const reason = flagReason || await readPrompt('Rejection reason');
      const convoyRoot = convoyRootPath(convoyRepoPath, convoyId);
      const actor = currentActor();
      const ts = new Date().toISOString();
      const reasonVal = reason || undefined;
      appendConvoyEvent(
        { ts, type: 'gate_rejected', convoy: convoyId, gate: gateType, stage, approver: actor, reason: reasonVal },
        convoyRoot
      );
      // ── Git sync: commit rejection event ──
      const rejectBehaviors = loadBehaviors(convoyRepoPath);
      if (rejectBehaviors.gate_approve.auto_commit) {
        gitSync(convoyRepoPath, [
          path.join('convoys', 'active', convoyId, 'events.jsonl'),
        ], `conduit: gate-${stage} rejected ${convoyId}`, { push: rejectBehaviors.gate_approve.auto_push });
      }

      console.log(`CONDUIT: gate ${gateType} rejected for ${convoyId} — stage ${stage} unchanged`);
      return;
    }

    case 'skip': {
      checkPermission(repoPath, 'write');
      if (remaining.length < 2) throw new Error('usage: conduit gate skip [convoy-id] [gate-type] --reason "..."');
      const [convoyId, gateType, ...skipRest] = remaining;
      validateConvoyId(convoyId);
      const yamlPath = convoyYamlPath(convoyRepoPath, convoyId);
      if (!fs.existsSync(yamlPath)) throw new Error(`convoy ${convoyId} not found in convoys/active/`);
      const stage = readStage(yamlPath);
      const { value: flagReason } = parseFlagValue(skipRest, '--reason');
      if (!flagReason) throw new Error('gate skip requires --reason "..." — skips must be intentional and documented');
      const convoyRoot = convoyRootPath(convoyRepoPath, convoyId);
      const actor = currentActor();
      const ts = new Date().toISOString();
      appendConvoyEvent(
        { ts, type: 'gate_skipped', convoy: convoyId, gate: gateType, stage, approver: actor, reason: flagReason },
        convoyRoot
      );
      // ── Git sync: commit skip event ──
      const skipBehaviors = loadBehaviors(convoyRepoPath);
      if (skipBehaviors.gate_approve.auto_commit) {
        gitSync(convoyRepoPath, [
          path.join('convoys', 'active', convoyId, 'events.jsonl'),
        ], `conduit: gate-${stage} skipped ${convoyId}`, { push: skipBehaviors.gate_approve.auto_push });
      }

      console.log(`CONDUIT: gate ${gateType} skipped for ${convoyId} at stage ${stage} — reason: ${flagReason}`);
      console.log(`  warn: Gate skip logged to audit trail. Human review recommended.`);
      return;
    }

    case 'request': {
      // ── ARCHITECTURE NOTE ──────────────────────────────────────────────────
      // conduit gate request is a CONTEXT ASSEMBLER, not an AI caller.
      // Conduit is always run inside an agent host (Claude Code, OpenAI Codex
      // CLI, or another agent layer). The AI evaluation happens in the
      // conversation — not in a subprocess calling a model API.
      //
      // This command:
      //   1. Assembles context from the convoy directory
      //   2. Prints it as a structured prompt block for the agent layer to evaluate
      //   3. Writes the assembled context to audit/gate-context-N.md for the record
      //
      // The agent layer reads the output, applies gate-evaluator.md, and returns
      // the GATE EVALUATION REPORT in the conversation. The human then runs
      // conduit gate approve / reject / skip to record the decision.
      // ──────────────────────────────────────────────────────────────────────

      checkPermission(repoPath, 'read');
      if (remaining.length < 2) throw new Error('usage: conduit gate request [convoy-id] [gate-type] [--request file]');
      const [convoyId, gateType, ...reqRest] = remaining;
      validateConvoyId(convoyId);
      const yamlPath = convoyYamlPath(convoyRepoPath, convoyId);
      if (!fs.existsSync(yamlPath)) throw new Error(`convoy ${convoyId} not found in convoys/active/`);

      const stage = readStage(yamlPath);
      const workType = readWorkType(yamlPath);
      const convoyRoot = convoyRootPath(convoyRepoPath, convoyId);

      // ── Gather context files ──
      const livingSpecPath = path.join(convoyRoot, 'living-spec.md');
      const livingSpec = fs.existsSync(livingSpecPath)
        ? fs.readFileSync(livingSpecPath, 'utf-8')
        : '(living-spec.md not found — context limited)';

      // Spec deviation check at Gate 3
      let specDeviationWarning = '';
      if (stage === 3) {
        const events = readConvoyEvents(convoyRoot);
        const gate2Event = events.find(e => e.type === 'gate_passed' && e.stage === 2 && e.details?.spec_hash);
        if (gate2Event && gate2Event.details?.spec_hash) {
          const currentSpecHash = crypto.createHash('sha256').update(livingSpec).digest('hex');
          if (currentSpecHash !== gate2Event.details.spec_hash) {
            specDeviationWarning = '\n\n⚠️ **SPEC DEVIATION DETECTED**: living-spec.md was modified after Gate 2 approval. Review changes before evaluating Gate 3.\n';
          }
        }
      }

      // ACCEPTANCE.md: look in workstreams subdirs
      let acceptance = '(ACCEPTANCE.md not found)';
      const workstreamsDir = path.join(convoyRoot, 'workstreams');
      if (fs.existsSync(workstreamsDir)) {
        for (const ws of fs.readdirSync(workstreamsDir)) {
          const candidate = path.join(workstreamsDir, ws, 'ACCEPTANCE.md');
          if (fs.existsSync(candidate)) {
            acceptance = fs.readFileSync(candidate, 'utf-8');
            break;
          }
        }
      }

      // Stage directive Gate Criteria section
      const dirType = directiveWorkType(workType);
      const directivePath = stageDirectivePath(convoyRepoPath, dirType, stage);
      let gateCriteria = '(stage directive not found — checklist unavailable)';
      if (directivePath && fs.existsSync(directivePath)) {
        const directiveContent = fs.readFileSync(directivePath, 'utf-8');
        gateCriteria = extractGateCriteria(directiveContent, stage) || directiveContent;
      }

      // Gate request body: --request <file> or prompt
      let requestBody: string;
      const { value: reqFile } = parseFlagValue(reqRest, '--request');
      const autoCommit = reqRest.includes('--auto-commit');
      if (reqFile) {
        if (!fs.existsSync(reqFile)) throw new Error(`gate request file not found: ${reqFile}`);
        requestBody = fs.readFileSync(reqFile, 'utf-8');
      } else {
        // Headless never prompts (headless-protocol §a/§e): the request body
        // must arrive via --request <file>. Without this guard the readline
        // below waits on stdin; at EOF its promise never resolves and node
        // exits 0 mid-await with no output — a silent CI no-op. Found by
        // Stage-4 QA (AC-6 coverage test).
        if (isHeadless()) throw new MissingContextFieldError('request');
        console.log('No --request file provided. Enter the gate request body (end with a line containing only "."):\n');
        const lines: string[] = [];
        const rl = (await import('node:readline')).createInterface({ input: process.stdin });
        await new Promise<void>(resolve => {
          rl.on('line', line => {
            if (line === '.') { rl.close(); resolve(); }
            else lines.push(line);
          });
        });
        requestBody = lines.join('\n');
      }

      // ── CLI-1: gate-request commit discipline (AC-1, AC-1a, AC-2, AC-3) ──
      if (reqFile && isGitRepo(convoyRepoPath)) {
        const auditDir = path.join(convoyRoot, 'audit');
        const requestFileDir = path.dirname(path.resolve(reqFile));
        const referenced = filterAuditLinks(extractMarkdownLinks(requestBody), requestFileDir, auditDir);

        const targetRepoPath = resolveTargetRepoPath(convoyId, convoyRepoPath);
        void targetRepoPath;

        const candidatePaths = [path.resolve(reqFile), ...referenced];
        const offending = candidatePaths.filter(abs => !isCommittedAndClean(path.relative(convoyRepoPath, abs).replace(/\\/g, '/'), convoyRepoPath));

        if (offending.length > 0) {
          if (!autoCommit) {
            const lines = offending.map(abs => {
              const rel = path.relative(convoyRepoPath, abs).replace(/\\/g, '/');
              const name = path.basename(abs);
              return `${name} is uncommitted at ${abs}; run \`git add ${rel} && git commit\` first, or re-run with --auto-commit`;
            });
            throw new Error(lines.join('\n'));
          }

          const pathspecs = offending.map(abs => path.relative(convoyRepoPath, abs).replace(/\\/g, '/'));
          const commitMsg = `audit(${convoyId}): commit gate-${stage}-request and referenced artifacts`;
          const result = commitAndPushPathspecs(pathspecs, commitMsg, convoyRepoPath);
          if (!result.ok) {
            throw new Error(`gate request --auto-commit failed: ${result.error}`);
          }
        }
      }

      // ── Assemble context block ──
      const evaluatorPath = path.join(convoyRepoPath, 'directives', 'shared', 'gate-evaluator.md');
      const evaluatorDirective = fs.existsSync(evaluatorPath)
        ? fs.readFileSync(evaluatorPath, 'utf-8')
        : '';

      // Token estimates per section for context budgeting
      const sectionTokens = {
        evaluator: estimateTokens(evaluatorDirective),
        gateCriteria: estimateTokens(gateCriteria),
        livingSpec: estimateTokens(livingSpec),
        acceptance: estimateTokens(acceptance),
        request: estimateTokens(requestBody),
      };
      const totalTokens = Object.values(sectionTokens).reduce((a, b) => a + b, 0);

      const contextBlock = [
        `<!-- CONDUIT GATE EVALUATION CONTEXT -->`,
        `<!-- Convoy: ${convoyId}  Gate: ${gateType}  Stage: ${stage}  Work-type: ${workType} -->`,
        `<!-- Generated: ${new Date().toISOString()} -->`,
        `<!-- Total: ${formatTokens(totalTokens)} | evaluator: ${formatTokens(sectionTokens.evaluator)} | criteria: ${formatTokens(sectionTokens.gateCriteria)} | spec: ${formatTokens(sectionTokens.livingSpec)} | acceptance: ${formatTokens(sectionTokens.acceptance)} | request: ${formatTokens(sectionTokens.request)} -->`,
        `<!-- Apply directives/shared/gate-evaluator.md and produce a GATE EVALUATION REPORT -->`,
        '',
        `## Gate Evaluator Directive`,
        evaluatorDirective,
        '',
        `## Gate Criteria (Stage ${stage} — ${dirType})`,
        gateCriteria,
        '',
        `## Living Spec`,
        livingSpec,
        specDeviationWarning,
        '',
        `## Acceptance Criteria (ACCEPTANCE.md)`,
        acceptance,
        '',
        `## Gate Request (written by developer)`,
        requestBody,
        '',
        `<!-- END CONDUIT GATE EVALUATION CONTEXT -->`,
      ].join('\n');

      // ── Write to audit directory for record ──
      const auditDir = path.join(convoyRoot, 'audit');
      fs.mkdirSync(auditDir, { recursive: true });
      const contextFile = path.join(auditDir, `gate-context-${stage}.md`);
      fs.writeFileSync(contextFile, contextBlock, 'utf-8');

      // ── Log gate_requested event ──
      const ts = new Date().toISOString();
      const actor = currentActor();
      appendConvoyEvent(
        { ts, type: 'gate_requested', convoy: convoyId, gate: gateType, stage, approver: actor },
        convoyRoot
      );

      // ── Git sync: commit gate context and request event ──
      const requestBehaviors = loadBehaviors(convoyRepoPath);
      if (requestBehaviors.gate_approve.auto_commit) {
        gitSync(convoyRepoPath, [
          path.join('convoys', 'active', convoyId, 'audit', `gate-context-${stage}.md`),
          path.join('convoys', 'active', convoyId, 'events.jsonl'),
        ], `conduit: gate-${stage} requested ${convoyId}`, { push: requestBehaviors.gate_approve.auto_push });
      }

      // ── Print for the agent layer to evaluate ──
      console.log(contextBlock);
      console.log('');
      console.log(`Context written to audit/gate-context-${stage}.md`);
      console.log(`Token budget: ${formatTokens(totalTokens)} total`);
      console.log(`  evaluator: ${formatTokens(sectionTokens.evaluator)}  criteria: ${formatTokens(sectionTokens.gateCriteria)}  spec: ${formatTokens(sectionTokens.livingSpec)}  acceptance: ${formatTokens(sectionTokens.acceptance)}  request: ${formatTokens(sectionTokens.request)}`);
      console.log('');
      console.log(`Read audit/gate-context-${stage}.md in ${agentName()} and apply gate-evaluator.md.`);
      console.log(`Then run: conduit gate approve / reject / skip to record the decision.`);
      emitLearningCheck('gate_request', convoyId, stage);
      return;
    }

    default:
      throw new Error(`unknown gate subcommand: ${subcommand}`);
  }
}
