// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/id-generator.ts
// description: Checkpoint ID generation from JSONL state. Last ID + 1, zero-padded to 6 digits.
// owner:       BOTH
// update:      Manual when ID format changes.
// schema:      none
// last_update: 2026-04-10
// ─────────────────────────────────────────────────────────────────────

import { readJSONL, DEFAULT_JSONL_PATH } from './checkpoint.js';

export function nextCheckpointID(filePath = DEFAULT_JSONL_PATH): string {
  const records = readJSONL(filePath);
  let maxNum = 0;
  for (const r of records) {
    const match = r.id.match(/^CP-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `CP-${String(maxNum + 1).padStart(6, '0')}`;
}
