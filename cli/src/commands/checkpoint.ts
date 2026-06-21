// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/checkpoint.ts
// description: Checkpoint command group — create, pass, fail, list with JSONL persistence.
// owner:       BOTH
// update:      Manual as checkpoint behavior changes.
// schema:      convoys/schema/checkpoint.schema.json
// last_update: 2026-04-10
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { checkPermission } from '../internal/signals.js';
import { resolveRepoPath, resolveConvoyRoot, parseFlagValue, currentActor, readPrompt } from '../utils.js';
import { appendJSONL, readJSONL, readLatest, filterByWorkstream, DEFAULT_JSONL_PATH, type Checkpoint } from '../internal/checkpoint.js';
import { nextCheckpointID } from '../internal/id-generator.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';
import { gitSync } from '../internal/git-sync.js';
import { loadBehaviors } from '../internal/behaviors.js';

function readConvoyStage(convoyRepoPath: string, workstreamId: string): number {
  // Try to find the convoy that owns this workstream by scanning active convoys
  const activeDir = path.join(convoyRepoPath, 'convoys', 'active');
  if (!fs.existsSync(activeDir)) return 0;
  for (const dir of fs.readdirSync(activeDir)) {
    if (dir.startsWith('_')) continue;
    const yamlPath = path.join(activeDir, dir, 'convoy.yaml');
    if (!fs.existsSync(yamlPath)) continue;
    const content = fs.readFileSync(yamlPath, 'utf-8');
    if (content.includes(workstreamId)) {
      const match = content.match(/^stage:\s*(\d+)/m);
      return match ? parseInt(match[1], 10) : 0;
    }
  }
  return 0;
}

export async function runCheckpoint(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit checkpoint <create|pass|fail|list> [args] [--repo path]');
    return;
  }

  const subcommand = args[0];
  const { remaining, repoPath } = resolveRepoPath(args.slice(1));
  const convoyRepoPath = resolveConvoyRoot(repoPath);
  const jsonlPath = path.join(repoPath, DEFAULT_JSONL_PATH);

  switch (subcommand) {
    case 'create': {
      checkPermission(repoPath, 'write');
      if (remaining.length < 2) throw new Error('usage: conduit checkpoint create [workstream-id] [title...] [--stdin]');
      const stdinFlag = remaining.includes('--stdin');
      const filteredRemaining = remaining.filter(r => r !== '--stdin');
      const workstreamId = filteredRemaining[0];
      const title = filteredRemaining.slice(1).join(' ');

      // Read piped stdin content when --stdin flag is present
      let evidence = '';
      if (stdinFlag && !process.stdin.isTTY) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        evidence = Buffer.concat(chunks).toString('utf-8').trim();
      }

      const id = nextCheckpointID(jsonlPath);
      const actualStage = readConvoyStage(convoyRepoPath, workstreamId);
      const cp: Checkpoint = {
        id,
        workstream_id: workstreamId,
        stage: actualStage,
        title,
        status: 'pending',
        agent_role: 'field-agent',
        acceptance_criteria: [],
        created_at: new Date().toISOString(),
        ...(evidence ? { notes: evidence } : {}),
      };
      appendJSONL(cp, jsonlPath);
      console.log(`CONDUIT: checkpoint ${id} created (workstream: ${workstreamId})`);
      return;
    }

    case 'pass': {
      checkPermission(repoPath, 'write');
      if (remaining.length < 1) throw new Error('usage: conduit checkpoint pass [checkpoint-id]');
      const checkpointId = remaining[0];
      const records = readJSONL(jsonlPath);
      const found = readLatest(records).find(r => r.id === checkpointId);
      if (!found) throw new Error(`checkpoint ${checkpointId} not found`);
      appendJSONL({ ...found, status: 'passed', completed_at: new Date().toISOString() }, jsonlPath);
      const convoyRoot = path.join(convoyRepoPath, 'convoys', 'active', found.workstream_id);
      if (fs.existsSync(convoyRoot)) {
        appendConvoyEvent({ ts: new Date().toISOString(), type: 'checkpoint_passed', convoy: found.workstream_id, checkpoint: checkpointId, stage: found.stage }, convoyRoot);
      }

      // ── Git sync: commit checkpoint pass ──
      const passBehaviors = loadBehaviors(convoyRepoPath);
      if (passBehaviors.checkpoint.auto_commit) {
        const passFiles = [DEFAULT_JSONL_PATH];
        if (fs.existsSync(convoyRoot)) {
          passFiles.push(path.join('convoys', 'active', found.workstream_id, 'events.jsonl'));
        }
        gitSync(convoyRepoPath, passFiles, `conduit: checkpoint ${checkpointId} passed`, { push: passBehaviors.checkpoint.auto_push });
      }

      console.log(`CONDUIT: checkpoint ${checkpointId} marked passed`);
      return;
    }

    case 'fail': {
      checkPermission(repoPath, 'write');
      if (remaining.length < 1) throw new Error('usage: conduit checkpoint fail [checkpoint-id] [--reason "..."]');
      const checkpointId = remaining[0];
      const records = readJSONL(jsonlPath);
      const found = readLatest(records).find(r => r.id === checkpointId);
      if (!found) throw new Error(`checkpoint ${checkpointId} not found`);
      const { value: flagReason, remaining: afterReason } = parseFlagValue(remaining.slice(1), '--reason');
      void afterReason;
      const reason = flagReason || await readPrompt('Failure reason');
      appendJSONL({ ...found, status: 'failed', completed_at: new Date().toISOString(), notes: reason || undefined }, jsonlPath);
      const convoyRoot = path.join(convoyRepoPath, 'convoys', 'active', found.workstream_id);
      if (fs.existsSync(convoyRoot)) {
        appendConvoyEvent({ ts: new Date().toISOString(), type: 'checkpoint_failed', convoy: found.workstream_id, checkpoint: checkpointId, stage: found.stage }, convoyRoot);
      }

      // ── Git sync: commit checkpoint fail ──
      const failBehaviors = loadBehaviors(convoyRepoPath);
      if (failBehaviors.checkpoint.auto_commit) {
        const failFiles = [DEFAULT_JSONL_PATH];
        if (fs.existsSync(convoyRoot)) {
          failFiles.push(path.join('convoys', 'active', found.workstream_id, 'events.jsonl'));
        }
        gitSync(convoyRepoPath, failFiles, `conduit: checkpoint ${checkpointId} failed`, { push: failBehaviors.checkpoint.auto_push });
      }

      console.log(`CONDUIT: checkpoint ${checkpointId} marked failed`);
      return;
    }

    case 'list': {
      checkPermission(repoPath, 'read');
      const { value: wsFilter } = parseFlagValue(remaining, '--workstream');
      let records = readLatest(readJSONL(jsonlPath));
      if (wsFilter) records = filterByWorkstream(records, wsFilter);
      if (records.length === 0) {
        console.log('No checkpoints found');
        return;
      }
      const header = 'ID          Stage  Status    Workstream              Title';
      const divider = '----------  -----  --------  ----------------------  -----';
      console.log(header);
      console.log(divider);
      for (const r of records) {
        const id = r.id.padEnd(10);
        const stage = String(r.stage).padEnd(5);
        const status = r.status.padEnd(8);
        const ws = r.workstream_id.slice(0, 22).padEnd(22);
        console.log(`${id}  ${stage}  ${status}  ${ws}  ${r.title}`);
      }
      return;
    }

    default:
      throw new Error(`unknown checkpoint subcommand: ${subcommand}`);
  }
}
