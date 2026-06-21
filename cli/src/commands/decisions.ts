// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/decisions.ts
// description: conduit decisions — surface Decision Learning System log entries.
// owner:       BOTH
// update:      Manual when command behavior changes.
// schema:      none
// last_update: 2026-05-22
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { resolveRepoPath, resolveConvoyRoot } from '../utils.js';
import { readDecisions, formatDecisions } from '../internal/decisions.js';

export async function runDecisions(args: string[]): Promise<void> {
  const { remaining, repoPath } = resolveRepoPath(args);
  const convoyRepoPath = resolveConvoyRoot(repoPath);

  const isAll = remaining.includes('--all');
  const filtered = remaining.filter(a => a !== '--all');

  if (isAll) {
    // Aggregate across all active convoys
    const activeDir = path.join(convoyRepoPath, 'convoys', 'active');
    if (!fs.existsSync(activeDir)) {
      console.log('No decisions logged across any active convoy');
      return;
    }

    const convoyDirs = fs.readdirSync(activeDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== '_template')
      .map(e => path.join(activeDir, e.name));

    const allEntries = convoyDirs.flatMap(dir => readDecisions(dir));

    if (allEntries.length === 0) {
      console.log('No decisions logged across any active convoy');
      return;
    }

    // Sort by timestamp ascending
    allEntries.sort((a, b) => a.ts.localeCompare(b.ts));

    console.log(`\nDecision Learning Log — all active convoys (${allEntries.length} entries)\n`);
    console.log(formatDecisions(allEntries));
    return;
  }

  const convoyId = filtered[0];
  if (!convoyId) {
    console.log('usage: conduit decisions <convoy-id>');
    console.log('       conduit decisions --all');
    return;
  }

  const convoyDir = path.join(convoyRepoPath, 'convoys', 'active', convoyId);
  const archiveDir = path.join(convoyRepoPath, 'convoys', 'archive', convoyId);
  const resolvedDir = fs.existsSync(convoyDir)
    ? convoyDir
    : fs.existsSync(archiveDir)
      ? archiveDir
      : null;

  if (!resolvedDir) {
    throw new Error(`convoy '${convoyId}' not found in convoys/active/ or convoys/archive/`);
  }

  const entries = readDecisions(resolvedDir);

  if (entries.length === 0) {
    console.log(`No decisions logged for convoy '${convoyId}'`);
    return;
  }

  console.log(`\nDecision Learning Log — ${convoyId} (${entries.length} entries)\n`);
  console.log(formatDecisions(entries));
}
