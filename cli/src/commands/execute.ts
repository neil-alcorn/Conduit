// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/execute.ts
// description: Autonomous execution engine — wave-based task execution with checkpoints.
//              Implements directives/shared/autonomous-execution.md.
// owner:       BOTH
// update:      Manual as execution behavior changes.
// schema:      conduit-core ExecutionManifest type
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveRepoPath, resolveConvoyRoot, parseFlagValue, currentActor, ConduitNotInitializedError } from '../utils.js';
import { checkPermission } from '../internal/signals.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';
import { agentName } from '../internal/agent-name.js';
import { isHeadless } from '../internal/headless-io.js';
import { loadHeadlessContext, backfillConvoyArg, type ContextSchema } from '../internal/context-parser.js';

/** Headless CONTEXT schema (headless-protocol §a) — declared here, validated
 *  before the command body runs. */
const HEADLESS_SCHEMA: ContextSchema = { command: 'execute', required: ['convoy_id'] };

function findActiveConvoy(repoPath: string, convoyId?: string): { id: string; root: string } {
  const resolved = resolveConvoyRoot(repoPath);
  if (convoyId) {
    const root = path.join(resolved, 'convoys', 'active', convoyId);
    if (!fs.existsSync(root)) throw new Error(`convoy ${convoyId} not found`);
    return { id: convoyId, root };
  }
  const activeDir = path.join(resolved, 'convoys', 'active');
  if (!fs.existsSync(activeDir)) throw new ConduitNotInitializedError('no convoys directory found');
  const dirs = fs.readdirSync(activeDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template');
  if (dirs.length === 0) throw new Error('no active convoy found');
  if (dirs.length > 1) throw new Error(`multiple active convoys — specify convoy-id: ${dirs.map(d => d.name).join(', ')}`);
  return { id: dirs[0].name, root: path.join(activeDir, dirs[0].name) };
}

export interface PlanTask {
  id: string;
  title: string;
  repo: string;
  depends: string;
  priority: string;
  wave: string;
  status: string;
}

function parsePlanTasks(planContent: string): PlanTask[] {
  const tasks: PlanTask[] = [];
  const lines = planContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^\|\s*(T-\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\w+)\s*\|/);
    if (match) {
      tasks.push({
        id: match[1].trim(),
        title: match[2].trim(),
        repo: match[3].trim(),
        depends: match[4].trim(),
        priority: match[5].trim(),
        wave: match[6].trim(),
        status: match[7].trim(),
      });
    }
  }
  return tasks;
}

export function getWaves(tasks: PlanTask[]): Map<number, PlanTask[]> {
  const waves = new Map<number, PlanTask[]>();
  for (const task of tasks) {
    const waveNum = task.wave !== undefined && task.wave !== '' ? parseInt(task.wave, 10) : 1;
    if (!waves.has(waveNum)) waves.set(waveNum, []);
    waves.get(waveNum)!.push(task);
  }
  return waves;
}

function generateManifestId(): string {
  return `EXM-${crypto.randomUUID().slice(0, 8)}`;
}

export async function runExecute(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit execute <start|status|pause|resume|checkpoint|wave-complete|complete|fail> [convoy-id] [--repo path]');
    console.log('');
    console.log('Subcommands:');
    console.log('  start          Begin wave-based execution from approved plan');
    console.log('  status         Show execution progress (waves, tasks, checkpoints)');
    console.log('  pause          Pause execution after current wave completes');
    console.log('  resume         Resume paused execution from last completed wave');
    console.log('  checkpoint     Check wave limit and pause if reached (AC-1/AC-2)');
    console.log('  wave-complete  Mark current wave complete and increment counter (AC-3)');
    console.log('  complete       Mark execution as successfully completed (AC-13)');
    console.log('  fail           Mark execution as failed [--reason "..."] (AC-14)');
    return;
  }

  // AC-1/AC-3: CONTEXT from stdin; convoy_id backfills the positional when
  // argv omits it (argv wins when both are present).
  if (isHeadless()) {
    const ctx = loadHeadlessContext(HEADLESS_SCHEMA);
    args = backfillConvoyArg(args, String(ctx['convoy_id']));
  }

  const subcommand = args[0];
  const { remaining, repoPath } = resolveRepoPath(args.slice(1));

  switch (subcommand) {
    case 'start': {
      checkPermission(repoPath, 'write');
      const { value: maxWavesStr } = parseFlagValue(remaining, '--max-waves');
      const maxWaves = maxWavesStr ? parseInt(maxWavesStr, 10) : 1;
      if (maxWaves > 5) throw new Error('CONDUIT: --max-waves cannot exceed 5. Split large convoys instead.');
      const convoy = findActiveConvoy(repoPath, remaining[0]);

      // Guard: prevent double execution start
      const existingManifest = path.join(convoy.root, 'execution-manifest.json');
      if (fs.existsSync(existingManifest)) {
        const existing = JSON.parse(fs.readFileSync(existingManifest, 'utf-8'));
        if (existing.status === 'executing') {
          throw new Error(`CONDUIT: execution ${existing.id} is already running for convoy ${convoy.id}. Use 'conduit execute status' to check progress.`);
        }
      }

      // Verify plan exists and is approved
      const planPath = path.join(convoy.root, 'plan.md');
      if (!fs.existsSync(planPath)) throw new Error(`CONDUIT: no plan found — run: conduit plan init ${convoy.id}`);
      const planContent = fs.readFileSync(planPath, 'utf-8');
      if (!/^## Status:\s*approved$/m.test(planContent)) {
        throw new Error('CONDUIT: plan must be approved before execution. Run: conduit plan approve ' + convoy.id);
      }

      // Parse tasks and waves
      const tasks = parsePlanTasks(planContent);
      if (tasks.length === 0) throw new Error('CONDUIT: no tasks found in plan. Populate the Task Graph first.');
      const waves = getWaves(tasks);
      const waveNums = [...waves.keys()].sort((a, b) => a - b);

      // Create execution manifest
      const manifestId = generateManifestId();
      const eventsFile = path.join(convoy.root, 'audit', 'execution.jsonl');
      fs.mkdirSync(path.dirname(eventsFile), { recursive: true });

      const manifest = {
        id: manifestId,
        convoy_id: convoy.id,
        plan_spec_id: (planContent.match(/## Plan ID:\s*(.+)/)?.[1] ?? '').trim(),
        status: 'executing',
        waves: waveNums.map(n => ({
          id: `W-${String(n).padStart(3, '0')}`,
          task_ids: waves.get(n)!.map(t => t.id),
          status: 'pending',
        })),
        current_wave: 1,
        checkpoint_after_wave: true,
        max_autonomous_waves: maxWaves,
        rollback_point: '',
        started_at: new Date().toISOString(),
        events_file: eventsFile,
      };

      // Write manifest
      const manifestPath = path.join(convoy.root, 'execution-manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      // Update plan status
      let updated = planContent.replace(/^(## Status:\s*)approved$/m, '$1executing');
      fs.writeFileSync(planPath, updated, 'utf-8');

      // Update convoy.yaml
      const yamlPath = path.join(convoy.root, 'convoy.yaml');
      if (fs.existsSync(yamlPath)) {
        let yamlContent = fs.readFileSync(yamlPath, 'utf-8');
        if (yamlContent.includes('execution_manifest_id:')) {
          yamlContent = yamlContent.replace(/execution_manifest_id:\s*["']?[^"'\n]*["']?/, `execution_manifest_id: "${manifestId}"`);
          fs.writeFileSync(yamlPath, yamlContent, 'utf-8');
        }
      }

      // Audit event
      appendConvoyEvent({
        ts: new Date().toISOString(),
        type: 'stage_started',
        convoy: convoy.id,
        notes: `execution ${manifestId} started — ${waveNums.length} waves, ${tasks.length} tasks, max ${maxWaves} autonomous waves`,
      }, convoy.root);

      // Log start event
      const startEvent = { ts: new Date().toISOString(), type: 'execution_started', manifest_id: manifestId, waves: waveNums.length, tasks: tasks.length };
      fs.appendFileSync(eventsFile, JSON.stringify(startEvent) + '\n', 'utf-8');

      console.log(`CONDUIT: execution ${manifestId} started for convoy ${convoy.id}`);
      console.log(`  Waves:         ${waveNums.length}`);
      console.log(`  Tasks:         ${tasks.length}`);
      console.log(`  Max autonomous: ${maxWaves} waves before human check-in`);
      console.log(`  Manifest:      ${manifestPath}`);
      console.log('');
      console.log('Wave 1 tasks (ready for parallel execution):');
      const wave1 = waves.get(waveNums[0]) ?? [];
      for (const t of wave1) {
        console.log(`  ${t.id}  ${t.title}  (${t.repo}, ${t.priority})`);
      }
      console.log('');
      console.log(`${agentName()}: execute Wave 1 tasks using your host's parallel-agent primitive per parallel-dispatch.md directive.`);
      console.log('After wave completes: conduit execute status ' + convoy.id);
      return;
    }

    case 'status': {
      checkPermission(repoPath, 'read');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const manifestPath = path.join(convoy.root, 'execution-manifest.json');
      if (!fs.existsSync(manifestPath)) {
        console.log(`CONDUIT: no active execution for convoy ${convoy.id}`);
        return;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      console.log(`CONDUIT: execution ${manifest.id} for convoy ${convoy.id}`);
      console.log(`  Status:        ${manifest.status}`);
      console.log(`  Current wave:  ${manifest.current_wave} of ${manifest.waves.length}`);
      console.log(`  Started:       ${manifest.started_at}`);
      console.log('');
      console.log('Waves:');
      for (const wave of manifest.waves) {
        console.log(`  ${wave.id}  ${wave.status.padEnd(12)}  tasks: ${wave.task_ids.join(', ')}`);
      }
      return;
    }

    case 'pause': {
      checkPermission(repoPath, 'write');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const manifestPath = path.join(convoy.root, 'execution-manifest.json');
      if (!fs.existsSync(manifestPath)) throw new Error('no active execution found');

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.status = 'paused';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      appendConvoyEvent({
        ts: new Date().toISOString(),
        type: 'convoy_paused',
        convoy: convoy.id,
        notes: `execution ${manifest.id} paused at wave ${manifest.current_wave}`,
      }, convoy.root);

      console.log(`CONDUIT: execution ${manifest.id} paused at wave ${manifest.current_wave}`);
      console.log(`  Resume: conduit execute resume ${convoy.id}`);
      return;
    }

    case 'resume': {
      checkPermission(repoPath, 'write');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const manifestPath = path.join(convoy.root, 'execution-manifest.json');
      if (!fs.existsSync(manifestPath)) throw new Error('no active execution found');

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.status !== 'paused' && manifest.status !== 'checkpoint-pending') {
        throw new Error(`execution is ${manifest.status}, not paused`);
      }
      const wasCheckpoint = manifest.status === 'checkpoint-pending';
      manifest.status = 'executing';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      appendConvoyEvent({
        ts: new Date().toISOString(),
        type: 'convoy_resumed',
        convoy: convoy.id,
        approver: currentActor(),
        notes: wasCheckpoint
          ? `checkpoint approved by ${currentActor()} — resuming execution at wave ${manifest.current_wave}`
          : `execution ${manifest.id} resumed at wave ${manifest.current_wave}`,
      }, convoy.root);

      console.log(`CONDUIT: execution ${manifest.id} resumed at wave ${manifest.current_wave}`);
      return;
    }

    case 'checkpoint': {
      checkPermission(repoPath, 'write');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const manifestPath = path.join(convoy.root, 'execution-manifest.json');
      if (!fs.existsSync(manifestPath)) throw new Error('no active execution found');

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.status !== 'executing') {
        throw new Error(`execution is ${manifest.status}, not executing`);
      }

      if (manifest.current_wave >= manifest.max_autonomous_waves) {
        // At wave limit — require human approval
        manifest.status = 'checkpoint-pending';
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

        appendConvoyEvent({
          ts: new Date().toISOString(),
          type: 'convoy_paused',
          convoy: convoy.id,
          notes: `checkpoint: wave limit reached (${manifest.current_wave}/${manifest.max_autonomous_waves}). Human approval required.`,
        }, convoy.root);

        console.log(`CONDUIT: checkpoint — wave limit reached (${manifest.current_wave}/${manifest.max_autonomous_waves})`);
        console.log(`  Status set to checkpoint-pending. Human must run:`);
        console.log(`  conduit execute resume ${convoy.id}`);
        console.log(`  to approve and continue execution.`);
      } else {
        // Below limit — increment and continue
        manifest.current_wave += 1;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

        appendConvoyEvent({
          ts: new Date().toISOString(),
          type: 'executor_wave_complete',
          convoy: convoy.id,
          notes: `wave ${manifest.current_wave - 1} complete. Advancing to wave ${manifest.current_wave} (limit: ${manifest.max_autonomous_waves}).`,
        }, convoy.root);

        console.log(`CONDUIT: wave ${manifest.current_wave - 1} complete — advancing to wave ${manifest.current_wave} of ${manifest.max_autonomous_waves}`);
      }
      return;
    }

    case 'wave-complete': {
      checkPermission(repoPath, 'write');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const manifestPath = path.join(convoy.root, 'execution-manifest.json');
      if (!fs.existsSync(manifestPath)) throw new Error('no active execution found');

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.status !== 'executing') {
        throw new Error(`execution is ${manifest.status}, not executing`);
      }

      manifest.current_wave += 1;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      appendConvoyEvent({
        ts: new Date().toISOString(),
        type: 'executor_wave_complete',
        convoy: convoy.id,
        notes: `wave ${manifest.current_wave - 1} marked complete. Now at wave ${manifest.current_wave}.`,
      }, convoy.root);

      console.log(`CONDUIT: wave ${manifest.current_wave - 1} complete — now at wave ${manifest.current_wave}`);
      return;
    }

    case 'complete': {
      checkPermission(repoPath, 'write');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const manifestPath = path.join(convoy.root, 'execution-manifest.json');
      if (!fs.existsSync(manifestPath)) throw new Error('no active execution found');

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.status = 'complete';
      manifest.completed_at = new Date().toISOString();
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      appendConvoyEvent({
        ts: new Date().toISOString(),
        type: 'executor_complete',
        convoy: convoy.id,
        notes: `execution ${manifest.id} completed successfully.`,
      }, convoy.root);

      console.log(`CONDUIT: execution ${manifest.id} completed for convoy ${convoy.id}`);
      return;
    }

    case 'fail': {
      checkPermission(repoPath, 'write');
      const { value: reason } = parseFlagValue(remaining, '--reason');
      const filteredRemaining = remaining.filter(a => a !== '--reason' && a !== reason);
      const convoy = findActiveConvoy(repoPath, filteredRemaining[0]);
      const manifestPath = path.join(convoy.root, 'execution-manifest.json');
      if (!fs.existsSync(manifestPath)) throw new Error('no active execution found');

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.status = 'failed';
      manifest.failed_at = new Date().toISOString();
      manifest.failure_reason = reason || 'unspecified';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      appendConvoyEvent({
        ts: new Date().toISOString(),
        type: 'executor_complete',
        convoy: convoy.id,
        notes: `execution ${manifest.id} failed: ${reason || 'unspecified'}`,
      }, convoy.root);

      console.log(`CONDUIT: execution ${manifest.id} failed for convoy ${convoy.id}`);
      if (reason) console.log(`  Reason: ${reason}`);
      return;
    }

    default:
      throw new Error(`unknown execute subcommand: ${subcommand}`);
  }
}
