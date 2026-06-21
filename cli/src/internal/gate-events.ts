// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/gate-events.ts
// description: Gate event types and JSONL audit log helpers.
// owner:       BOTH
// update:      Manual when gate event schema changes.
// schema:      none
// last_update: 2026-04-11
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { readConvoyEvents } from './convoy-events.js';

export interface GateEvent {
  ts: string;
  type: 'gate_requested' | 'gate_passed' | 'gate_rejected' | 'gate_evaluation' | 'gate_skipped';
  convoy: string;
  gate: string;
  stage: number;
  approver: string;
  reason?: string;
  verdict?: 'APPROVE' | 'SEND_BACK' | 'ESCALATE';
}

// DEPRECATED: gate-log.jsonl is no longer written to. All gate events are recorded
// in events.jsonl via appendConvoyEvent(). This function is kept only for backward
// compatibility — readGateLog() below falls back to it for old convoys.
export function appendGateEvent(event: GateEvent, convoyRoot: string): void {
  const auditDir = path.join(convoyRoot, 'audit');
  fs.mkdirSync(auditDir, { recursive: true });
  const logPath = path.join(auditDir, 'gate-log.jsonl');
  const lockPath = logPath + '.lock';

  // Acquire lock (atomic create with wx flag)
  let lockFd: number | undefined;
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      lockFd = fs.openSync(lockPath, 'wx');
      break;
    } catch {
      // Lock held by another process — wait and retry
      const waitMs = 50 + Math.random() * 100;
      const start = Date.now();
      while (Date.now() - start < waitMs) { /* busy wait */ }
    }
  }

  try {
    fs.appendFileSync(logPath, JSON.stringify(event) + '\n', 'utf-8');
  } finally {
    if (lockFd !== undefined) {
      fs.closeSync(lockFd);
      try { fs.unlinkSync(lockPath); } catch { /* already cleaned */ }
    }
  }
}

const GATE_EVENT_TYPES = new Set(['gate_requested', 'gate_passed', 'gate_rejected', 'gate_evaluation', 'gate_skipped']);

/**
 * Read gate events. Tries audit/gate-log.jsonl first (backward compat for old convoys),
 * then falls back to events.jsonl filtered for gate event types.
 */
export function readGateLog(convoyRoot: string): GateEvent[] {
  const logPath = path.join(convoyRoot, 'audit', 'gate-log.jsonl');
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf-8').trim();
    if (content) {
      const lines = content.split('\n').filter(l => l.trim());
      return lines.reduce((acc, line, idx) => {
        try {
          acc.push(JSON.parse(line) as GateEvent);
        } catch {
          console.warn(`CONDUIT warn: skipping corrupt line ${idx + 1} in JSONL file`);
        }
        return acc;
      }, [] as GateEvent[]);
    }
  }
  // Fall back to events.jsonl filtered for gate events
  const allEvents = readConvoyEvents(convoyRoot);
  return allEvents
    .filter(e => GATE_EVENT_TYPES.has(e.type))
    .map(e => ({
      ts: e.ts,
      type: e.type as GateEvent['type'],
      convoy: e.convoy,
      gate: e.gate ?? '',
      stage: e.stage ?? 0,
      approver: e.approver ?? '',
      reason: e.reason,
    }));
}
