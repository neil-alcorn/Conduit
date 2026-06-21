// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/diff-scope.ts
// description: Resolves the convoy's branch-vs-base diff scope so pre-gate
//              checks (CLI-2) can grep only the changed source files
//              instead of the whole tree. Reads `base_branch` from
//              convoy.yaml (default `master`); detects orphan branches
//              gracefully via `git merge-base`.
//              Defect #4 (Stage 2): both git invocations migrated from
//              execSync(`"${gitBin()}" ...`) shell-string form to
//              execFileSync(gitBin(), [argv]) so `base` (read from
//              convoy.yaml) cannot be interpreted as shell.
// owner:       BOTH
// update:      Manual when diff-scope contract changes.
// schema:      none
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface DiffScope {
  base: string;
  changedFiles: string[];
  orphan: boolean;
}

const DEFAULT_TEST_GLOBS = ['**/tests/**', '**/*.test.ts'];

function gitBin(): string {
  return process.env.GIT_PATH || 'git';
}

export function isTestFile(p: string, globs: string[] = DEFAULT_TEST_GLOBS): boolean {
  const norm = p.replace(/\\/g, '/');
  for (const g of globs) {
    if (g === '**/tests/**' && /(^|\/)tests\//.test(norm)) return true;
    if (g.startsWith('**/*') && !g.slice(4).includes('/')) {
      if (norm.endsWith(g.slice(4))) return true;
    }
  }
  return false;
}

function readBaseBranch(repoPath: string, convoyId?: string): string {
  if (!convoyId) return 'master';
  const yamlPath = path.join(repoPath, 'convoys', 'active', convoyId, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) return 'master';
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const match = content.match(/^base_branch:\s*["']?([^"'\n]+)["']?/m);
  return match ? match[1].trim() : 'master';
}

export function resolveDiffScope(
  repoPath: string,
  opts: { base?: string; convoyId?: string; testGlobs?: string[] } = {},
): DiffScope {
  const base = opts.base ?? readBaseBranch(repoPath, opts.convoyId);
  const testGlobs = opts.testGlobs ?? DEFAULT_TEST_GLOBS;

  try {
    execFileSync(gitBin(), ['merge-base', base, 'HEAD'], {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 5000,
    });
  } catch {
    return { base, changedFiles: [], orphan: true };
  }

  let raw = '';
  try {
    raw = execFileSync(gitBin(), ['diff', `${base}..HEAD`, '--name-only'], {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 15000,
    }).toString();
  } catch {
    return { base, changedFiles: [], orphan: true };
  }

  const all = raw.split('\n').map(s => s.trim()).filter(s => s.length > 0);
  const changedFiles = all.filter(p => !isTestFile(p, testGlobs));
  return { base, changedFiles, orphan: false };
}
