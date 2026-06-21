// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/convoy-events.ts
// description: Convoy event types and events.jsonl timeline helpers. The
//              events.jsonl lock fails closed (AC-21): no unlocked appends.
// owner:       BOTH
// update:      Manual when convoy event schema changes.
// schema:      convoys/schema/events.schema.json
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';

export interface FileRead {
  path: string;        // repo-relative path
  est_tokens: number;  // estimated via tokens.estimateFileTokens
}

export interface ModelUsage {
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  // Files the agent reportedly read during this stage turn. Optional —
  // populated by `conduit usage record --read-file <path>` (repeatable).
  // Not authoritative (agent honor system); useful for surfacing the
  // most-read files via `conduit usage report --top-files`.
  files_read?: FileRead[];
}

export interface ConvoyEvent {
  ts: string;
  type: 'convoy_started' | 'gate_passed' | 'gate_rejected' | 'gate_skipped' | 'gate_requested' | 'stage_started' |
        'checkpoint_passed' | 'checkpoint_failed' | 'convoy_closed' |
        'convoy_paused' | 'convoy_resumed' | 'convoy_removed' |
        'executor_started' | 'executor_wave_complete' | 'executor_complete' |
        'agent_dispatched' | 'agent_complete' | 'plan_created' | 'review_complete' |
        'debug_session_started' | 'debug_session_resolved' | 'self_correction' |
        'pr_created' | 'model_usage' | 'convoy_promoted';
  convoy: string;
  gate?: string;
  stage?: number;
  approver?: string;
  reason?: string;
  checkpoint?: string;
  notes?: string;
  workstream?: string;
  details?: Record<string, unknown>;
  duration_ms?: number;
  usage?: ModelUsage;
}

// ── Valid event transitions (state machine) ──────────────────────────
// model_usage is a passive observation event — allowed after any non-terminal
// state, and never blocks the next real transition (it's not added as a key
// here, so anything can follow it).
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  'convoy_created': new Set(['gate_requested', 'gate_passed', 'stage_started', 'convoy_paused', 'convoy_removed', 'model_usage']),
  'stage_started': new Set(['gate_requested', 'gate_passed', 'gate_rejected', 'gate_skipped', 'checkpoint_passed', 'checkpoint_failed', 'convoy_paused', 'convoy_removed', 'executor_started', 'executor_wave_complete', 'executor_complete', 'agent_dispatched', 'agent_complete', 'plan_created', 'review_complete', 'debug_session_started', 'self_correction', 'model_usage']),
  'gate_requested': new Set(['gate_passed', 'gate_rejected', 'gate_skipped', 'model_usage']),
  'gate_passed': new Set(['stage_started', 'convoy_closed', 'convoy_promoted', 'model_usage']),
  'convoy_promoted': new Set(['convoy_closed', 'model_usage']),
  'gate_rejected': new Set(['gate_requested', 'stage_started', 'convoy_paused', 'model_usage']),
  'gate_skipped': new Set(['gate_requested', 'gate_passed', 'stage_started', 'convoy_paused', 'model_usage']),
  'convoy_paused': new Set(['convoy_resumed']),
  'convoy_resumed': new Set(['gate_requested', 'gate_passed', 'stage_started', 'checkpoint_passed', 'checkpoint_failed', 'convoy_paused', 'executor_wave_complete', 'executor_complete', 'agent_dispatched', 'self_correction', 'model_usage']),
  'convoy_closed': new Set([]), // terminal — nothing after close
};

function validateTransition(lastType: string | undefined, newType: string): void {
  if (!lastType) return; // first event, anything goes
  const allowed = VALID_TRANSITIONS[lastType];
  if (allowed && !allowed.has(newType)) {
    console.warn(`CONDUIT warn: unusual event transition from ${lastType} to ${newType}`);
  }
}

/** The events.jsonl lock could not be acquired after retries (AC-21 /
 *  review BUG-8). The append is REFUSED — the audit log is never written
 *  without the lock. Callers may retry the whole command. */
export class LockContentionError extends Error {
  constructor(lockPath: string) {
    super(`could not acquire ${lockPath} after retries — another conduit process is writing; retry the command`);
    this.name = 'LockContentionError';
  }
}

// A lock older than this is presumed abandoned by a crashed process and is
// reclaimed. Real appends hold the lock for milliseconds; ten seconds is
// orders of magnitude past any legitimate hold time.
const LOCK_STALE_MS = 10_000;

/** Blocking sleep without CPU spin: Atomics.wait on a never-notified buffer
 *  times out after ms. Keeps appendConvoyEvent synchronous (its ~30 call
 *  sites predate this fix) while eliminating the busy-wait (AC-21). */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Check whether a PID is alive. `process.kill(pid, 0)` sends no signal but
 *  throws if the process doesn't exist. */
function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Lock payload: `<pid>:<timestamp>`. Allows the reclaimer to verify the
 *  holder is dead before stealing, closing the TOCTOU window (SEC-M4). */
function lockPayload(): string {
  return `${process.pid}:${Date.now()}`;
}

function parseLockPayload(content: string): { pid: number; ts: number } | null {
  const [pidStr, tsStr] = content.trim().split(':');
  const pid = parseInt(pidStr, 10);
  const ts = parseInt(tsStr, 10);
  if (!Number.isFinite(pid) || !Number.isFinite(ts)) return null;
  return { pid, ts };
}

export function appendConvoyEvent(event: ConvoyEvent, convoyRoot: string): void {
  const eventsPath = path.join(convoyRoot, 'events.jsonl');
  const lockPath = eventsPath + '.lock';

  // Validate transition before writing
  const existing = fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, 'utf-8').trim() : '';
  if (existing) {
    const lines = existing.split('\n').filter(l => l.trim());
    const lastLine = lines[lines.length - 1];
    try {
      const lastEvent = JSON.parse(lastLine) as ConvoyEvent;
      validateTransition(lastEvent.type, event.type);
    } catch { /* corrupt last line — skip validation */ }
  }

  // Acquire lock (atomic create with wx flag). Fail CLOSED: if the lock
  // cannot be acquired after retries, the append is refused — an unlocked
  // append can interleave with a concurrent writer and corrupt the audit
  // log CI depends on (review BUG-8).
  //
  // SEC-M4: the lock file contains `<pid>:<timestamp>`. Before reclaiming a
  // stale lock the reclaimer verifies the holder PID is dead, closing the
  // TOCTOU window between stat-age-check and unlink.
  let lockFd: number | undefined;
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      lockFd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(lockFd, lockPayload(), 'utf-8');
      break;
    } catch {
      // Lock held — reclaim only if the holder is dead AND the lock is stale.
      try {
        const content = fs.readFileSync(lockPath, 'utf-8');
        const holder = parseLockPayload(content);
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age > LOCK_STALE_MS && (!holder || !isPidAlive(holder.pid))) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch { /* lock vanished between open and stat — retry */ }
      sleepSync(50 + Math.random() * 100);
    }
  }
  if (lockFd === undefined) {
    throw new LockContentionError(lockPath);
  }

  try {
    fs.appendFileSync(eventsPath, JSON.stringify(event) + '\n', 'utf-8');
  } finally {
    fs.closeSync(lockFd);
    try { fs.unlinkSync(lockPath); } catch { /* already cleaned */ }
  }
}

export function appendExecutorEvent(convoyRoot: string, event: {
  type: string;
  convoy: string;
  workstream?: string;
  details?: Record<string, unknown>;
  duration_ms?: number;
}): void {
  appendConvoyEvent({
    ts: new Date().toISOString(),
    ...event
  } as ConvoyEvent, convoyRoot);
}

/**
 * Read convoy events from events.jsonl.
 *
 * Pass `{ last: N }` to return only the most recent N events — useful for
 * pure-display callers (status, context summaries) where full history would
 * blow up agent context on long-running convoys. Default is unbounded.
 *
 * **Do not** pass `last` when correctness depends on full history (gate
 * state machine, audit trails). Tail truncation drops older events that
 * may carry the only record of a prior gate decision.
 */
export function readConvoyEvents(convoyRoot: string, opts?: { last?: number }): ConvoyEvent[] {
  const eventsPath = path.join(convoyRoot, 'events.jsonl');
  if (!fs.existsSync(eventsPath)) return [];
  const allLines = fs.readFileSync(eventsPath, 'utf-8').split('\n').filter(l => l.trim());
  const lines = opts?.last && opts.last > 0 && opts.last < allLines.length
    ? allLines.slice(-opts.last)
    : allLines;
  return lines.reduce((acc, line, idx) => {
    try {
      acc.push(JSON.parse(line) as ConvoyEvent);
    } catch {
      console.warn(`CONDUIT warn: skipping corrupt line ${idx + 1} in JSONL file`);
    }
    return acc;
  }, [] as ConvoyEvent[]);
}
