// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/convoy.ts
// description: Convoy command group for convoy lifecycle actions and ingress sanitization.
// owner:       BOTH
// update:      Manual as convoy management behavior is implemented.
// schema:      convoys/schema/convoy.schema.json
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import { checkPermission } from '../internal/signals.js';
import { sanitize, findRepoRoot } from '../internal/sanitizer.js';
import { resolveRepoPath, resolveConvoyRoot, resolveTargetRepoPath, assertConduitRepo, parseFlagValue, readPrompt, mdSafe, currentActor, todayISO, deriveConvoyID, validateConvoyId } from '../utils.js';
import { CONVOY_YAML_DUMP_OPTIONS, loadConvoyYamlWithHeader, updateConvoyYaml } from '../internal/convoy-yaml.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';
import { readGateLog } from '../internal/gate-events.js';
import { gitSync } from '../internal/git-sync.js';
import { loadBehaviors } from '../internal/behaviors.js';
import { upsertRepoEntry } from '../internal/conduit-config.js';
import { isHeadless } from '../internal/headless-io.js';
import { headlessEvent } from '../internal/headless-output.js';

// Terminal convoy.yaml status values — once set, the CLI refuses to mutate them.
// Reversal requires a manual edit + commit so the change shows up in git blame
// as an intentional act.
const TERMINAL_STATUSES = new Set(['released', 'withdrawn']);

function emitCloseLearningCheck(convoyId: string): void {
  const data = {
    trigger: 'convoy_close',
    convoy_id: convoyId,
    message: 'Review whether this convoy produced a reusable repo skill, rule, or decision learning. If yes, run conduit learn with --evidence.',
  };
  if (isHeadless()) {
    headlessEvent('learning_check', data);
    return;
  }
  console.log('');
  console.log('LEARNING CHECK');
  console.log(`  If this convoy produced reusable guidance, run: conduit learn <skill|rule> --convoy ${convoyId} --evidence <artifact>`);
}

export async function runConvoy(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit convoy <new|close|pause|resume|remove|list> [args]');
    return;
  }

  switch (args[0]) {
    case 'new':    return runConvoyNew(args.slice(1));
    case 'close':  return runConvoyClose(args.slice(1));
    case 'pause':  return runConvoyPause(args.slice(1));
    case 'resume': return runConvoyResume(args.slice(1));
    case 'remove': return runConvoyRemove(args.slice(1));
    case 'list':   console.log('conduit convoy list: not yet implemented'); return;
    default:       throw new Error(`unknown convoy subcommand: ${args[0]}`);
  }
}

async function runConvoyNew(args: string[]): Promise<void> {
  const { remaining: r1, repoPath } = resolveRepoPath(args);
  checkPermission(repoPath, 'write');
  const convoyRepoPath = resolveConvoyRoot(repoPath);

  // ── CLI-4 writeRegistry guard (defense-in-depth, post-gate-3 follow-up) ──
  // resolveConvoyRoot's lenient explicit-startPath fallback returns the path
  // unchanged when no env/config signal matches. Without this assertion, a
  // `convoy new` invocation from a target repo's CWD would silently mkdirSync
  // + writeFileSync into convoys/ — the secondary write-layer hole the CLI-4
  // commit message acknowledged. Throws ConduitNotInitializedError if the
  // resolved root is not already a conduit-shaped repo. Bypassed by
  // CONDUIT_LEGACY_RESOLVE=1 for the same one-release escape-hatch window.
  assertConduitRepo(convoyRepoPath, 'convoy new');

  // ── CLI-4: capture target_repo metadata at convoy creation (AC-18) ──
  // Resolves the CWD's git root so source-code commits land back in the
  // right repo regardless of where conduit was invoked from. The basename
  // becomes the logical `target_repo` identifier; the absolute path goes
  // into ~/.conduit/config.json so other developers can resolve it via
  // their own per-machine config.
  let targetRepo = 'conduit';
  let targetRepoPath = convoyRepoPath;
  try {
    const gitTop = execSync('git rev-parse --show-toplevel', {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 5000,
    }).toString().trim();
    if (gitTop) {
      targetRepoPath = gitTop;
      targetRepo = path.basename(gitTop);
      try { upsertRepoEntry(targetRepo, gitTop); } catch { /* config write failure is non-fatal */ }
    }
  } catch { /* not a git repo — keep defaults */ }

  let { value: title, remaining: r2 }        = parseFlagValue(r1, '--title');
  let { value: description, remaining: r3 }  = parseFlagValue(r2, '--description');
  let { value: workType, remaining: r4 }     = parseFlagValue(r3, '--work-type');
  let { value: customId, remaining: r5 }     = parseFlagValue(r4, '--id');
  let { value: workItem, remaining: r6 }     = parseFlagValue(r5, '--work-item');
  let { value: initiativeId, remaining: r7 } = parseFlagValue(r6, '--initiative');

  if (r7.length > 0) throw new Error(`unexpected arguments: ${r7.join(' ')}`);

  if (!workType) workType = 'net-new';
  if (!title) title = await readPrompt('Convoy title');
  if (!description) description = await readPrompt('Convoy description');

  // Sanitizer patterns live in the conduit repo (convoyRepoPath), not the target repo
  const sanitizerRoot = convoyRepoPath;

  const titleResult = sanitize('conduit convoy new:title', title, sanitizerRoot);
  if (!titleResult.allowed) {
    throw new Error(`CONDUIT: sanitizer blocked input for conduit convoy new:title. Review .conduit/sanitizer.log for details`);
  }
  const descResult = sanitize('conduit convoy new:description', description, sanitizerRoot);
  if (!descResult.allowed) {
    throw new Error(`CONDUIT: sanitizer blocked input for conduit convoy new:description. Review .conduit/sanitizer.log for details`);
  }

  const convoyID = customId || deriveConvoyID(titleResult.sanitized, convoyRepoPath);
  const today = todayISO();
  const actor = currentActor();

  const convoyDir = path.join(convoyRepoPath, 'convoys', 'active', convoyID);
  fs.mkdirSync(path.join(convoyDir, 'workstreams'), { recursive: true });
  fs.mkdirSync(path.join(convoyDir, 'audit'), { recursive: true });


  const headerBlock = `# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        convoys/active/${convoyID}/convoy.yaml
# description: Active convoy metadata and state record.
# owner:       BOTH
# update:      On stage transition, gate approval, and work stream status change.
# schema:      convoys/schema/convoy.schema.json
# last_update: ${today}
# ─────────────────────────────────────────────────────────────────────
`;

  const topDoc: Record<string, unknown> = {
    id: convoyID,
    title: titleResult.sanitized,
    work_type: workType,
    stage: 0,
    status: 'active',
    ...(workItem ? { work_item: workItem } : {}),
    ...(initiativeId ? { initiative_id: initiativeId } : {}),
    created_date: today,
    created_by: actor,
    bp_gate_required: false,
    workstreams: [],
  };
  const metadataDoc = {
    metadata: { target_repo: targetRepo, target_repo_path: targetRepoPath },
  };

  const convoyYAML = headerBlock
    + yaml.dump(topDoc, CONVOY_YAML_DUMP_OPTIONS)
    + yaml.dump(metadataDoc, CONVOY_YAML_DUMP_OPTIONS);

  const livingSpec = `<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        convoys/active/${convoyID}/living-spec.md
# description: Living specification for the convoy.
# owner:       BOTH
# update:      At every Stage transition; agents update and humans approve at Gates.
# schema:      none
# last_update: ${today}
# ─────────────────────────────────────────────────────────────────────
-->

# Living Spec: ${mdSafe(titleResult.sanitized)}

**Convoy:** ${convoyID}  |  **Work Type:** ${workType}  |  **Stage:** 0
**Last Updated:** ${today}  |  **Updated By:** ${mdSafe(actor)}

---

## Intent

${mdSafe(descResult.sanitized)}

## Acceptance Criteria

- [ ] Define acceptance criteria before QA Gate review.

## Solution Design

To be proposed during Solution Design.

## Work Streams

| Work Stream ID | Repo | Stage | Status | Depends On |
|----------------|------|-------|--------|------------|

## Decisions Log

| Date | Decision | Rationale | Made By |
|------|----------|-----------|---------|

## What Was Actually Built

To be completed at Release.

## Gate History

| Gate | Stage | Approver | Date | Decision |
|------|-------|----------|------|----------|
`;

  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'), convoyYAML, 'utf-8');
  fs.writeFileSync(path.join(convoyDir, 'living-spec.md'), livingSpec, 'utf-8');

  // Emit convoy_started event
  const ts = new Date().toISOString();
  appendConvoyEvent({ ts, type: 'convoy_started', convoy: convoyID }, convoyDir);

  updateConvoyRegistry(convoyRepoPath, convoyID);

  // ── Git sync: commit new convoy files ──
  const newBehaviors = loadBehaviors(convoyRepoPath);
  if (newBehaviors.gate_approve.auto_commit) {
    gitSync(convoyRepoPath, [
      path.join('convoys', 'active', convoyID),
      'convoys/registry.yaml',
    ], `conduit: convoy created ${convoyID}`, { push: newBehaviors.gate_approve.auto_push });
  }

  console.log(`CONDUIT: Created convoy ${convoyID}`);
}

// ── PAUSE ─────────────────────────────────────────────────────────────────
// Sets status to paused. Keeps the convoy in convoys/active/ so it can be resumed.
// Use when switching to another convoy temporarily.
async function runConvoyPause(args: string[]): Promise<void> {
  const { remaining, repoPath } = resolveRepoPath(args);
  checkPermission(repoPath, 'write');
  const convoyRepoPath = resolveConvoyRoot(repoPath);
  const convoyId = remaining[0];
  if (!convoyId) throw new Error('usage: conduit convoy pause [convoy-id]');
  validateConvoyId(convoyId);

  const yamlPath = path.join(convoyRepoPath, 'convoys', 'active', convoyId, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) throw new Error(`convoy ${convoyId} not found in convoys/active/`);

  // AC-19 (BUG-3): parse-modify-serialize — no regex templating of status.
  const { doc: pauseDoc } = loadConvoyYamlWithHeader(yamlPath);
  const pauseStatus = String(pauseDoc['status'] ?? '');
  if (TERMINAL_STATUSES.has(pauseStatus)) {
    throw new Error(`cannot reopen ${convoyId} — released and withdrawn are terminal states (use 'convoy resume' on a paused convoy if you intended that)`);
  }
  if (pauseStatus === 'paused') { console.log(`CONDUIT: convoy ${convoyId} is already paused`); return; }

  updateConvoyYaml(yamlPath, doc => { doc['status'] = 'paused'; }, { touchLastUpdate: todayISO() });

  const convoyRoot = path.join(convoyRepoPath, 'convoys', 'active', convoyId);
  appendConvoyEvent({ ts: new Date().toISOString(), type: 'convoy_paused', convoy: convoyId }, convoyRoot);

  // ── Git sync: commit pause state change ──
  const pauseBehaviors = loadBehaviors(convoyRepoPath);
  if (pauseBehaviors.gate_approve.auto_commit) {
    gitSync(convoyRepoPath, [
      path.join('convoys', 'active', convoyId, 'convoy.yaml'),
      path.join('convoys', 'active', convoyId, 'events.jsonl'),
    ], `conduit: convoy paused ${convoyId}`, { push: pauseBehaviors.gate_approve.auto_push });
  }

  console.log(`CONDUIT: convoy ${convoyId} paused — files remain in convoys/active/`);
  console.log(`  Resume with: conduit convoy resume ${convoyId}`);
}

// ── RESUME ────────────────────────────────────────────────────────────────
async function runConvoyResume(args: string[]): Promise<void> {
  const { remaining, repoPath } = resolveRepoPath(args);
  checkPermission(repoPath, 'write');
  const convoyRepoPath = resolveConvoyRoot(repoPath);
  const convoyId = remaining[0];
  if (!convoyId) throw new Error('usage: conduit convoy resume [convoy-id]');
  validateConvoyId(convoyId);

  const yamlPath = path.join(convoyRepoPath, 'convoys', 'active', convoyId, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) throw new Error(`convoy ${convoyId} not found in convoys/active/`);

  // AC-19 (BUG-3): parse-modify-serialize — no regex templating of status.
  const { doc: resumeDoc } = loadConvoyYamlWithHeader(yamlPath);
  const resumeStatus = String(resumeDoc['status'] ?? '');
  if (TERMINAL_STATUSES.has(resumeStatus)) {
    throw new Error(`cannot reopen ${convoyId} — released and withdrawn are terminal states (use 'convoy resume' on a paused convoy if you intended that)`);
  }
  updateConvoyYaml(yamlPath, doc => { doc['status'] = 'active'; }, { touchLastUpdate: todayISO() });

  const convoyRoot = path.join(convoyRepoPath, 'convoys', 'active', convoyId);
  appendConvoyEvent({ ts: new Date().toISOString(), type: 'convoy_resumed', convoy: convoyId }, convoyRoot);

  // ── Git sync: commit resume state change ──
  const resumeBehaviors = loadBehaviors(convoyRepoPath);
  if (resumeBehaviors.gate_approve.auto_commit) {
    gitSync(convoyRepoPath, [
      path.join('convoys', 'active', convoyId, 'convoy.yaml'),
      path.join('convoys', 'active', convoyId, 'events.jsonl'),
    ], `conduit: convoy resumed ${convoyId}`, { push: resumeBehaviors.gate_approve.auto_push });
  }

  console.log(`CONDUIT: convoy ${convoyId} resumed`);
  console.log(`  Run: conduit context ${convoyId}`);
}

// ── REMOVE ────────────────────────────────────────────────────────────────
// Permanently removes an ABANDONED convoy (work will not be completed).
// Deletes the local convoy files.
// Requires --confirm to execute. Without it, prints a dry-run summary.
async function runConvoyRemove(args: string[]): Promise<void> {
  const { remaining: r1, repoPath } = resolveRepoPath(args);
  checkPermission(repoPath, 'write');
  const convoyRepoPath = resolveConvoyRoot(repoPath);

  // Boolean flag — the CLI's own dry-run output tells users to append a bare --confirm.
  const confirmFlag = r1.includes('--confirm');
  const r2 = r1.filter(a => a !== '--confirm');
  const convoyId = r2[0];
  if (!convoyId) throw new Error('usage: conduit convoy remove [convoy-id] [--confirm]');

  const convoyRoot = path.join(convoyRepoPath, 'convoys', 'active', convoyId);
  if (!fs.existsSync(convoyRoot)) {
    // Also check archive
    const archived = path.join(convoyRepoPath, 'convoys', 'archive', convoyId);
    if (fs.existsSync(archived)) throw new Error(`convoy ${convoyId} is already archived (closed) — cannot remove a closed convoy`);
    throw new Error(`convoy ${convoyId} not found in convoys/active/`);
  }

  const yamlPath = path.join(convoyRoot, 'convoy.yaml');
  const yamlContent = fs.readFileSync(yamlPath, 'utf-8');

  const titleMatch = yamlContent.match(/^title:\s*["']?([^"'\n]+)["']?/m);
  const title = titleMatch ? titleMatch[1].trim() : convoyId;

  // ── DRY RUN (no --confirm) ──────────────────────────────────────────────
  if (!confirmFlag) {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('CONDUIT CONVOY REMOVE — DRY RUN (no changes made)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Convoy:  ${convoyId}`);
    console.log(`Title:   ${title}`);
    console.log('');
    console.log('This will PERMANENTLY DELETE:');
    console.log(`  Local:  convoys/active/${convoyId}/  (all files)`);
    console.log('');
    console.log('This action is IRREVERSIBLE. Use pause instead if you may resume later.');
    console.log('');
    console.log('To confirm removal, run:');
    console.log(`  conduit convoy remove ${convoyId} --confirm`);
    console.log('');
    return;
  }

  // ── CONFIRMED — execute removal ─────────────────────────────────────────
  // Write removed event before deleting
  appendConvoyEvent({ ts: new Date().toISOString(), type: 'convoy_removed', convoy: convoyId, reason: 'removed by ' + currentActor() }, convoyRoot);

  // Remove local directory
  fs.rmSync(convoyRoot, { recursive: true, force: true });

  // Update registry
  updateConvoyRegistryClose(convoyRepoPath, convoyId);

  // ── Git sync: commit removal and registry update ──
  const removeBehaviors = loadBehaviors(convoyRepoPath);
  if (removeBehaviors.convoy_close.auto_commit) {
    gitSync(convoyRepoPath, [
      'convoys/registry.yaml',
    ], `conduit: convoy removed ${convoyId}`, { push: removeBehaviors.convoy_close.auto_push });
  }

  console.log(`CONDUIT: convoy ${convoyId} removed`);
}

async function runConvoyClose(args: string[]): Promise<void> {
  const { remaining, repoPath } = resolveRepoPath(args);
  checkPermission(repoPath, 'write');
  const convoyRepoPath = resolveConvoyRoot(repoPath);

  // Parse flags. Accept boolean --withdrawn (with or without value) and value-bearing --reason.
  const rest = remaining.slice(1);
  const withdrawnFlag = rest.includes('--withdrawn');
  const restNoWithdrawn = rest.filter(a => a !== '--withdrawn');
  const forceFlag = restNoWithdrawn.includes('--force');
  const r1 = restNoWithdrawn.filter(a => a !== '--force');
  const { value: reasonValue,  remaining: r2 } = parseFlagValue(r1, '--reason');
  if (r2.length > 0) throw new Error(`unexpected arguments: ${r2.join(' ')}`);

  const convoyId = remaining[0];
  if (!convoyId) throw new Error('usage: conduit convoy close [convoy-id] [--withdrawn --reason "<text>"] [--force] [--repo path]');
  validateConvoyId(convoyId);

  // AC-6 — withdrawn requires reason ≥ 10 chars. Validate before any state read.
  if (withdrawnFlag) {
    const reason = (reasonValue ?? '').trim();
    if (reason.length < 10) {
      throw new Error(`--reason is required when --withdrawn is set (minimum 10 chars; describe why this convoy was abandoned for the audit trail)`);
    }
  } else if (reasonValue) {
    // --reason supplied without --withdrawn — flag the contradiction explicitly
    throw new Error(`--reason is only meaningful with --withdrawn; either add --withdrawn or drop --reason`);
  }

  const activeDir  = path.join(convoyRepoPath, 'convoys', 'active', convoyId);
  const archiveDir = path.join(convoyRepoPath, 'convoys', 'archive', convoyId);

  if (!fs.existsSync(activeDir)) throw new Error(`convoy ${convoyId} not found in convoys/active/`);
  if (fs.existsSync(archiveDir)) throw new Error(`convoy ${convoyId} already exists in convoys/archive/ — already closed?`);

  const yamlPath = path.join(activeDir, 'convoy.yaml');
  // AC-19 (BUG-3): read state through the YAML parser, not line regexes.
  const { doc: closeDoc } = loadConvoyYamlWithHeader(yamlPath);

  // Guard: check stage >= 8 unless --force is provided
  const rawStage = closeDoc['stage'];
  const currentStage = typeof rawStage === 'number' ? rawStage : parseInt(String(rawStage ?? ''), 10) || 0;
  if (currentStage < 8 && !forceFlag && !withdrawnFlag) {
    throw new Error(`convoy ${convoyId} is at stage ${currentStage} — cannot close before stage 8. Use --withdrawn --reason "..." to abandon, or --force to override.`);
  }

  // Guard: status not "paused"
  const currentStatus = String(closeDoc['status'] ?? 'active');
  if (currentStatus === 'paused' && !forceFlag) {
    throw new Error(`convoy ${convoyId} is paused — resume it first or use --force to close anyway.`);
  }

  // AC-7 — terminal-status convoys cannot be re-closed
  if (TERMINAL_STATUSES.has(currentStatus)) {
    throw new Error(`cannot reopen ${convoyId} — released and withdrawn are terminal states (use 'convoy resume' on a paused convoy if you intended that)`);
  }

  // AC-5 — without --withdrawn, default close requires Gate 8 approval in the audit trail.
  if (!withdrawnFlag) {
    const gateEvents = readGateLog(activeDir);
    const lastGateEvent = [...gateEvents].reverse().find(e => e.gate);
    // Gate identifiers in events.jsonl are recorded as the user-supplied gate name
    // (e.g., "gate-8") rather than the bare number. Normalize before comparing so
    // both shapes match.
    const gateNum = (g: string | number | undefined): string => String(g ?? '').replace(/^gate-/, '');
    const gate8Approved = gateEvents.some(e => e.type === 'gate_passed' && gateNum(e.gate) === '8');
    if (!gate8Approved) {
      const lastDesc = lastGateEvent
        ? `gate-${gateNum(lastGateEvent.gate)}:${lastGateEvent.type.replace(/^gate_/, '').replace('passed', 'approve').replace('rejected', 'reject').replace('skipped', 'skip').replace('requested', 'request')}`
        : 'no gate events';
      throw new Error(`cannot close ${convoyId} as released — Gate 8 not approved (most recent gate: ${lastDesc}); pass --withdrawn --reason "<...>" to close as withdrawn`);
    }
  }

  const newStatus = withdrawnFlag ? 'withdrawn' : 'released';
  const ts = new Date().toISOString();
  const today = todayISO();
  const actor = currentActor();

  // Update convoy.yaml: status, last_update, and terminal timestamp + reason.
  // AC-19 (BUG-3): parse-modify-serialize — a --reason payload containing
  // newlines or YAML syntax stays contained in withdrawn_reason as a string.
  updateConvoyYaml(yamlPath, doc => {
    doc['status'] = newStatus;
    // Idempotent — drop any prior terminal fields before setting the new ones.
    delete doc['released_at'];
    delete doc['withdrawn_at'];
    delete doc['withdrawn_reason'];
    if (newStatus === 'released') {
      doc['released_at'] = ts;
    } else {
      doc['withdrawn_at'] = ts;
      doc['withdrawn_reason'] = (reasonValue ?? '').trim();
    }
  }, { touchLastUpdate: today });

  // Write convoy_closed event before moving (kept as 'convoy_closed' for state-machine compat;
  // the convoy.yaml status is the source of truth for released vs withdrawn distinction)
  const eventDetails: Record<string, unknown> = { resolution: newStatus, actor };
  if (newStatus === 'withdrawn') eventDetails['reason'] = (reasonValue ?? '').trim();
  appendConvoyEvent({ ts, type: 'convoy_closed', convoy: convoyId, details: eventDetails }, activeDir);

  // ── CLI-4 / AC-19: explicit target-repo resolution at the archive-move step ──
  // resolveTargetRepoPath is invoked to identify the convoy's target repo even
  // though the archive move itself operates on convoyRepoPath (the conduit repo)
  // — convoys/active/<id>/ and convoys/archive/<id>/ both live in the conduit
  // repo under CLI-4's central-only rule. The helper invocation is recorded
  // against the AC and establishes the wiring pattern for any future cross-
  // repo cleanup step that close should perform on the target repo.
  const targetRepoPath = resolveTargetRepoPath(convoyId, convoyRepoPath);
  void targetRepoPath;

  // Move to archive
  fs.mkdirSync(path.join(convoyRepoPath, 'convoys', 'archive'), { recursive: true });
  fs.renameSync(activeDir, archiveDir);

  // Update registry: remove from active, add to archived (with terminal metadata)
  updateConvoyRegistryClose(convoyRepoPath, convoyId, {
    resolution: newStatus,
    timestamp: ts,
    reason: newStatus === 'withdrawn' ? (reasonValue ?? '').trim() : undefined,
  });

  // ── Git sync: commit archived convoy and registry update ──
  const closeBehaviors = loadBehaviors(convoyRepoPath);
  if (closeBehaviors.convoy_close.auto_commit) {
    const verb = newStatus === 'released' ? 'released' : 'withdrawn';
    // Defect #2 (Stage 2): include the active/ path so both sides of the
    // rename land in the same commit. Without this, archive additions are
    // committed but active deletions remain unstaged, producing dirty-tree
    // warnings on the next CLI invocation. gitSync's `git add -u` fallback
    // handles the now-nonexistent active path correctly (stages deletions
    // for previously-tracked files matching the pathspec).
    gitSync(convoyRepoPath, [
      path.join('convoys', 'active', convoyId),
      path.join('convoys', 'archive', convoyId),
      'convoys/registry.yaml',
    ], `conduit: convoy ${verb} ${convoyId} — archived`, { push: closeBehaviors.convoy_close.auto_push });
  }


  if (newStatus === 'released') {
    console.log(`CONDUIT: convoy ${convoyId} released and archived`);
  } else {
    console.log(`CONDUIT: convoy ${convoyId} withdrawn and archived`);
    console.log(`  Reason: ${(reasonValue ?? '').trim()}`);
  }
  console.log(`  Archive: convoys/archive/${convoyId}/`);
  console.log(`  Run: conduit context    to check for other active convoys`);
  emitCloseLearningCheck(convoyId);
}

interface ActiveConvoyEntry {
  id: string;
  title?: string;
  work_type?: string;
  stage?: number;
  status?: string;
  work_item?: string;
  created_date?: string;
  path?: string;
}

interface ArchivedConvoyEntry {
  id: string;
  path?: string;
  status?: string;
  released_at?: string;
  withdrawn_at?: string;
  withdrawn_reason?: string;
}

interface ConvoyRegistry {
  convoys: {
    active: (ActiveConvoyEntry | string)[];
    archived: (ArchivedConvoyEntry | string)[];
    pending?: unknown[];
  };
}

function getEntryId(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && entry !== null) return (entry as Record<string, unknown>)['id'] as string ?? '';
  return '';
}

function updateConvoyRegistry(repoPath: string, convoyID: string): void {
  const registryPath = path.join(repoPath, 'convoys', 'registry.yaml');
  const raw = fs.readFileSync(registryPath, 'utf-8');
  const registry = yaml.load(raw) as ConvoyRegistry;

  // Read convoy.yaml to build a rich entry
  const convoyYamlPath = path.join(repoPath, 'convoys', 'active', convoyID, 'convoy.yaml');
  let entry: ActiveConvoyEntry = { id: convoyID, path: `convoys/active/${convoyID}/` };
  if (fs.existsSync(convoyYamlPath)) {
    const convoyContent = fs.readFileSync(convoyYamlPath, 'utf-8');
    const titleMatch = convoyContent.match(/^title:\s*["']?([^"'\n]+)["']?/m);
    const workTypeMatch = convoyContent.match(/^work_type:\s*["']?([^"'\n]+)["']?/m);
    const stageMatch = convoyContent.match(/^stage:\s*(\d+)/m);
    const statusMatch = convoyContent.match(/^status:\s*(\S+)/m);
    const workItemMatch = convoyContent.match(/^work_item:\s*["']?([^"'\n]*)["']?/m);
    const dateMatch = convoyContent.match(/^created_date:\s*["']?([^"'\n]+)["']?/m);
    entry = {
      id: convoyID,
      title: titleMatch?.[1]?.trim(),
      work_type: workTypeMatch?.[1]?.trim(),
      stage: stageMatch ? parseInt(stageMatch[1], 10) : 0,
      status: statusMatch?.[1] ?? 'active',
      work_item: workItemMatch?.[1]?.trim() ?? '',
      created_date: dateMatch?.[1]?.trim(),
      path: `convoys/active/${convoyID}/`,
    };
  }

  // Avoid duplicates
  const active = (registry.convoys.active ?? []).filter(e => getEntryId(e) !== convoyID);
  registry.convoys.active = [...active, entry];

  const header = registryHeader();
  fs.writeFileSync(registryPath, header + yaml.dump(registry), 'utf-8');
}

function updateConvoyRegistryClose(
  repoPath: string,
  convoyID: string,
  terminal?: { resolution: 'released' | 'withdrawn'; timestamp: string; reason?: string },
): void {
  const registryPath = path.join(repoPath, 'convoys', 'registry.yaml');
  if (!fs.existsSync(registryPath)) return;
  const raw = fs.readFileSync(registryPath, 'utf-8');
  const registry = yaml.load(raw) as ConvoyRegistry;

  // Remove from active (handles both string IDs and object entries)
  const active = registry.convoys.active ?? [];
  registry.convoys.active = active.filter(entry => getEntryId(entry) !== convoyID);

  // Add to archived as structured entry, including terminal metadata when supplied
  const archivedEntry: ArchivedConvoyEntry = { id: convoyID, path: `convoys/archive/${convoyID}/` };
  if (terminal) {
    archivedEntry.status = terminal.resolution;
    if (terminal.resolution === 'released') {
      archivedEntry.released_at = terminal.timestamp;
    } else {
      archivedEntry.withdrawn_at = terminal.timestamp;
      if (terminal.reason) archivedEntry.withdrawn_reason = terminal.reason;
    }
  }
  const archived = (registry.convoys.archived ?? []).filter(entry => getEntryId(entry) !== convoyID);
  registry.convoys.archived = [...archived, archivedEntry];

  fs.writeFileSync(registryPath, registryHeader() + yaml.dump(registry), 'utf-8');
}

// ── Update registry entry when gate is approved ──
// Exported for use by gate.ts
//
// Defect 1c (2026-05-13): the previous implementation only touched the `stage`
// field. Any other convoy.yaml field set after `convoy new` (e.g.,
// `work_item` filled in later) never resynced to the registry, so
// downstream consumers (e.g. `conduit context`) saw stale data.
//
// Fix: delegate to `updateConvoyRegistry()` which re-reads the full convoy.yaml
// and rewrites the active entry across all tracked fields. The caller has
// already written the new stage to convoy.yaml via `incrementStage()` in
// gate.ts, so the rich re-read picks it up automatically — the `newStage`
// parameter is preserved for call-site compatibility but no longer needed.
export function updateConvoyRegistryStage(repoPath: string, convoyID: string, newStage: number): void {
  void newStage; // retained for call-site signature compat; stage is re-read from convoy.yaml
  const registryPath = path.join(repoPath, 'convoys', 'registry.yaml');
  if (!fs.existsSync(registryPath)) {
    console.warn(`CONDUIT warn: registry.yaml not found at ${registryPath} — convoy registry not updated`);
    return;
  }
  updateConvoyRegistry(repoPath, convoyID);
}

function registryHeader(): string {
  return `# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        convoys/registry.yaml
# description: Master registry of active and archived convoys known to the local orchestration repo.
# owner:       BOTH
# update:      On convoy creation, archive, and status changes.
# schema:      convoys/schema/convoy.schema.json
# last_update: ${todayISO()}
# ─────────────────────────────────────────────────────────────────────
`;
}
