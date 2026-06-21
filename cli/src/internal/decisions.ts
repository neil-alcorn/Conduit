// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/decisions.ts
// description: Decision Learning System — persist and surface runtime judgment calls.
// owner:       BOTH
// update:      Manual when DecisionEntry schema changes.
// schema:      none
// last_update: 2026-05-22
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';

export interface DecisionEntry {
  ts: string;
  question: string;
  reasoning: string;
  userResponse: string;
  action: string;
  convoy: string;
}

const DECISIONS_FILE = 'decisions.log';

export function appendDecision(convoyDir: string, entry: DecisionEntry): void {
  const logPath = path.join(convoyDir, DECISIONS_FILE);
  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err: any) {
    const msg = (err?.message || 'write failed').trim();
    console.log(`CONDUIT: failed to write decisions.log — ${msg}`);
    console.log(`CONDUIT: decision record (copy manually if needed):`);
    console.log(JSON.stringify(entry, null, 2));
    // Do not throw — the decision was surfaced; logging failure is non-fatal
  }
}

export function readDecisions(convoyDir: string): DecisionEntry[] {
  const logPath = path.join(convoyDir, DECISIONS_FILE);
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(l => l.trim());
  return lines.reduce((acc, line, idx) => {
    try {
      acc.push(JSON.parse(line) as DecisionEntry);
    } catch {
      console.warn(`CONDUIT warn: skipping corrupt line ${idx + 1} in decisions.log`);
    }
    return acc;
  }, [] as DecisionEntry[]);
}

export function formatDecisions(entries: DecisionEntry[]): string {
  if (entries.length === 0) return '';
  return entries.map(e => {
    const date = new Date(e.ts).toLocaleString();
    return [
      `[${date}] ${e.convoy}`,
      `  Q: ${e.question}`,
      `  Reasoning: ${e.reasoning}`,
      `  User response: ${e.userResponse}`,
      `  Action taken: ${e.action}`,
    ].join('\n');
  }).join('\n\n');
}
