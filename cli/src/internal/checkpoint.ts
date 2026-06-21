// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/checkpoint.ts
// description: Checkpoint types and JSONL persistence. SQLite removed — JSONL is the store.
// owner:       BOTH
// update:      Manual when checkpoint persistence behavior changes.
// schema:      convoys/schema/checkpoint.schema.json
// last_update: 2026-04-07
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_JSONL_PATH = '.conduit/checkpoints.jsonl';

export interface AcceptanceCriterion {
  criterion: string;
  result: string;
  notes?: string;
}

export interface Checkpoint {
  id: string;
  workstream_id: string;
  stage: number;
  title: string;
  description?: string;
  status: string;
  agent_role: string;
  acceptance_criteria: AcceptanceCriterion[];
  agent_session?: string;
  started_at?: string;
  completed_at?: string;
  notes?: string;
  created_at: string;
}

export function appendJSONL(cp: Checkpoint, filePath = DEFAULT_JSONL_PATH): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(cp) + '\n', 'utf-8');
}

export function readJSONL(filePath = DEFAULT_JSONL_PATH): Checkpoint[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
  return lines.reduce((acc, line, idx) => {
    try {
      acc.push(JSON.parse(line) as Checkpoint);
    } catch {
      console.warn(`CONDUIT warn: skipping corrupt line ${idx + 1} in JSONL file`);
    }
    return acc;
  }, [] as Checkpoint[]);
}

export function filterByWorkstream(records: Checkpoint[], workstreamId: string): Checkpoint[] {
  return records.filter(r => r.workstream_id === workstreamId);
}

// Last-record-wins dedup: for each checkpoint ID, the latest appended record is authoritative.
export function readLatest(records: Checkpoint[]): Checkpoint[] {
  const map = new Map<string, Checkpoint>();
  for (const r of records) map.set(r.id, r);
  return [...map.values()];
}
