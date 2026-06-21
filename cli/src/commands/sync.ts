// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/sync.ts
// description: Sync command — placeholder; no work-item tracker integration in this build.
// owner:       BOTH
// update:      Manual as sync behavior evolves.
// schema:      none
// last_update: 2026-06-15
// ─────────────────────────────────────────────────────────────────────

import { resolveRepoPath } from '../utils.js';
import { autoRegisterCwdRepo } from '../internal/conduit-config.js';

export async function runSync(args: string[]): Promise<void> {
  const { repoPath } = resolveRepoPath(args);

  // WS-1: auto-register the CWD repo into config.repos so target-repo
  // resolution works for any dev, not just the convoy creator.
  autoRegisterCwdRepo(repoPath);

  console.log('conduit sync: work-item tracker integration not configured in this build.');
  console.log('  Use your tracker\'s native tooling or MCP server to sync work items.');
}
