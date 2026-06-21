// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/status.ts
// description: Conduit status — aggregates convoy stage, last gate event, and checkpoint summary.
// owner:       BOTH
// update:      Manual as status output changes.
// schema:      none
// last_update: 2026-04-10
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { resolveRepoPath, resolveConvoyRoot } from '../utils.js';
import { readJSONL, readLatest, filterByWorkstream, DEFAULT_JSONL_PATH } from '../internal/checkpoint.js';
import { readConvoyEvents } from '../internal/convoy-events.js';
import type { GateEvent } from '../internal/gate-events.js';

function findConvoyRoot(repoPath: string, convoyId: string): string {
  return path.join(repoPath, 'convoys', 'active', convoyId);
}

function scanActiveConvoys(repoPath: string): string[] {
  const activeDir = path.join(repoPath, 'convoys', 'active');
  if (!fs.existsSync(activeDir)) return [];
  return fs.readdirSync(activeDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template')
    .map(e => e.name);
}

function readStageFromYaml(yamlPath: string): { stage: number; status: string } {
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const stageMatch = content.match(/^stage:\s*(\d+)/m);
  const statusMatch = content.match(/^status:\s*(\S+)/m);
  return {
    stage: stageMatch ? parseInt(stageMatch[1], 10) : 0,
    status: statusMatch ? statusMatch[1] : 'unknown',
  };
}

export function runStatus(args: string[]): void {
  const { remaining, repoPath } = resolveRepoPath(args);
  const convoyRepoPath = resolveConvoyRoot(repoPath);

  let convoyId = remaining[0];
  if (!convoyId) {
    const active = scanActiveConvoys(convoyRepoPath);
    if (active.length === 0) {
      console.log('No active convoy found');
      return;
    }
    convoyId = active[0];
  }

  const convoyRoot = findConvoyRoot(convoyRepoPath, convoyId);
  const yamlPath = path.join(convoyRoot, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) {
    throw new Error(`convoy ${convoyId} not found in convoys/active/`);
  }

  const { stage, status } = readStageFromYaml(yamlPath);

  // Read gate events from events.jsonl (single source of truth)
  const GATE_TYPES = new Set(['gate_requested', 'gate_passed', 'gate_rejected', 'gate_evaluation', 'gate_skipped']);
  // Display-only path — tail to last 200 events to keep memory bounded on
  // long-running convoys. Gate events are sparse (≤2 per stage), so 200 is
  // more than enough to surface the most-recent gate.
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
    }));
  const lastGate = gateEvents.length > 0 ? gateEvents[gateEvents.length - 1] : null;
  const lastGateStr = lastGate
    ? `${lastGate.gate} ${lastGate.type} by ${lastGate.approver} at ${lastGate.ts.slice(0, 10)}`
    : '(none)';

  const jsonlPath = path.join(repoPath, DEFAULT_JSONL_PATH);
  const all = readLatest(readJSONL(jsonlPath));
  const mine = filterByWorkstream(all, convoyId);
  const passed = mine.filter(r => r.status === 'passed').length;
  const failed = mine.filter(r => r.status === 'failed').length;
  const pending = mine.filter(r => r.status === 'pending').length;

  console.log(`CONDUIT STATUS: ${convoyId}`);
  console.log(`  Stage:       ${stage}`);
  console.log(`  Status:      ${status}`);
  console.log(`  Last gate:   ${lastGateStr}`);
  console.log(`  Checkpoints: ${passed} passed  ${failed} failed  ${pending} pending`);
}
