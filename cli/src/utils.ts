// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/utils.ts
// description: Shared CLI helpers: repo path resolution, flag parsing, prompts.
//              CLI-4 (2026-04-30): resolveConvoyRoot now resolves only to
//              an explicit conduit-shaped path, env CONDUIT_HOME, or the
//              ~/.conduit/config.json `central` field — never auto-creates,
//              never walks up from CWD. Escape hatch: CONDUIT_LEGACY_RESOLVE=1.
// owner:       BOTH
// update:      Manual when CLI command helper behavior changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { readConfig } from './internal/conduit-config.js';

export class ConduitNotInitializedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConduitNotInitializedError';
  }
}

export function resolveRepoPath(args: string[]): { remaining: string[]; repoPath: string } {
  const remaining: string[] = [];
  let repoPath = '.';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo') {
      if (i + 1 >= args.length) throw new Error('missing value for --repo');
      repoPath = args[++i];
    } else {
      remaining.push(args[i]);
    }
  }

  return { remaining, repoPath: path.resolve(repoPath) };
}

export function parseFlagValue(args: string[], flagName: string): { value: string; remaining: string[] } {
  const remaining: string[] = [];
  let value = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === flagName) {
      if (i + 1 >= args.length) throw new Error(`missing value for ${flagName}`);
      value = args[++i];
    } else {
      remaining.push(args[i]);
    }
  }

  return { value, remaining };
}

export async function readPrompt(label: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${label}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function mdSafe(value: string): string {
  return value.trim();
}

/** SEC-L1: returns OS username — spoofable via env var. See headless-protocol.md §g. */
export function currentActor(): string {
  return process.env['USERNAME'] ?? process.env['USER'] ?? 'CONDUIT';
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function looksLikeConduitRepo(p: string): boolean {
  return fs.existsSync(path.join(p, 'convoys', 'registry.yaml')) ||
         fs.existsSync(path.join(p, 'convoys', 'active'));
}

/**
 * Refuse to perform a write-side convoy operation against a directory that is
 * not already a conduit-shaped repo. Defense-in-depth follow-up to CLI-4 / AC-16:
 * `resolveConvoyRoot` removes the walk-up that produced the hm-sites incident,
 * but its lenient explicit-startPath fallback returns the path unchanged when
 * no env/config signal matches. Without this guard, a write-side command
 * (e.g., `convoy new`) called from a target repo's CWD would silently
 * bootstrap a parallel orchestration root via mkdirSync + writeFileSync.
 *
 * Throws `ConduitNotInitializedError` with a recovery message naming the
 * operation. Bypassed when `CONDUIT_LEGACY_RESOLVE=1` for the same escape-hatch
 * window as the CLI-4 rollout.
 */
export function assertConduitRepo(repoPath: string, operation: string): void {
  if (process.env.CONDUIT_LEGACY_RESOLVE === '1') return;
  if (looksLikeConduitRepo(repoPath)) return;
  throw new ConduitNotInitializedError(
    `${operation}: refusing to bootstrap convoys/ in ${repoPath} — not a conduit repo. ` +
    `Run \`conduit init --global <path-to-conduit>\` once on this machine to point at the central conduit repo, ` +
    `or set CONDUIT_HOME=<path>. CONDUIT_LEGACY_RESOLVE=1 bypasses this guard for one release.`,
  );
}

/**
 * Legacy CWD-walk behavior preserved as an escape hatch (one release window).
 * Activated by `CONDUIT_LEGACY_RESOLVE=1`. Will be removed in R2 alongside
 * the env var read.
 */
function resolveConvoyRootLegacyCWDWalk(startPath?: string): string {
  let current = path.resolve(startPath || '.');
  if (fs.existsSync(path.join(current, 'convoys', 'active'))) return current;
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    if (fs.existsSync(path.join(current, 'convoys', 'active'))) return current;
  }
  return path.resolve(startPath || '.');
}

/**
 * Resolve the central conduit repo root (CLI-4 / AC-16).
 *
 * Resolution order:
 *   1. If `startPath` is provided AND looks like a conduit repo, return it.
 *      (Explicit-path semantics — caller knows where they are. Tests rely
 *      on this.)
 *   2. `$CONDUIT_HOME` if it points at a conduit-shaped directory.
 *   3. `central` field of `~/.conduit/config.json` if it points at one.
 *   4. Otherwise throw ConduitNotInitializedError.
 *
 * MUST NOT walk up from CWD. MUST NOT auto-create a registry. The
 * `CONDUIT_LEGACY_RESOLVE=1` env var restores the pre-CLI-4 walk-up
 * behavior for one release as an escape hatch.
 */
export function resolveConvoyRoot(startPath?: string): string {
  if (process.env.CONDUIT_LEGACY_RESOLVE === '1') {
    return resolveConvoyRootLegacyCWDWalk(startPath);
  }

  if (startPath) {
    const explicit = path.resolve(startPath);
    if (looksLikeConduitRepo(explicit)) return explicit;
  }

  const envHome = process.env.CONDUIT_HOME;
  if (envHome && looksLikeConduitRepo(envHome)) return envHome;

  const config = readConfig();
  if (config.central && looksLikeConduitRepo(config.central)) return config.central;

  // Lenient fallback: if the caller explicitly passed a startPath (e.g.,
  // `--repo <path>`), trust that as the convoy root rather than throwing.
  // Critically: NO walk-up from CWD — the hm-sites bug — and NO auto-create
  // here either. Downstream commands surface a helpful error if the path
  // doesn't actually contain convoy state. Only when no startPath was given
  // (e.g., a session entry-point with no CWD signal) do we throw.
  if (startPath) return path.resolve(startPath);

  throw new ConduitNotInitializedError(
    'Conduit not initialized. Run `conduit init --global <path>` to point at the central conduit repo.',
  );
}

/**
 * Resolve the absolute filesystem path of a convoy's target repo (AC-19).
 * Reads `metadata.target_repo` from convoy.yaml; maps it through
 * `~/.conduit/config.json` `repos`. Falls back to `metadata.target_repo_path`
 * if the config has no entry.
 *
 * Returns null if the convoy.yaml has no metadata block, the config has no
 * matching entry, AND no fallback path is recorded — caller decides whether
 * to warn or fail.
 *
 * Inference rule for pre-CLI-4 convoys: if the convoy.yaml has no
 * `metadata.target_repo`, assume `conduit` (since pre-CLI-4 convoys could
 * only ever resolve to the conduit repo itself).
 */
export function resolveTargetRepoPath(convoyId: string, convoyRepoPath?: string): string | null {
  validateConvoyId(convoyId);
  const root = convoyRepoPath ?? (() => {
    try { return resolveConvoyRoot(); } catch { return null; }
  })();
  if (!root) return null;
  const yamlPath = path.join(root, 'convoys', 'active', convoyId, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) return null;
  const content = fs.readFileSync(yamlPath, 'utf-8');

  const repoMatch = content.match(/^\s*target_repo:\s*["']?([^"'\n]+)["']?/m);
  const repoName = repoMatch ? repoMatch[1].trim() : 'conduit';

  if (repoName === 'conduit') return root;

  const config = readConfig();
  const fromConfig = config.repos?.[repoName];
  if (fromConfig && fs.existsSync(fromConfig)) return fromConfig;

  const pathMatch = content.match(/^\s*target_repo_path:\s*["']?([^"'\n]+)["']?/m);
  if (pathMatch && fs.existsSync(pathMatch[1].trim())) return pathMatch[1].trim();

  return null;
}

/**
 * Wraps resolveTargetRepoPath with actionable clone/register guidance when
 * resolution fails. Emits instructions to stderr so callers can still throw
 * their own errors. Returns the resolved path or null.
 */
export function resolveTargetRepoPathOrOffer(convoyId: string, convoyRepoPath?: string): string | null {
  const resolved = resolveTargetRepoPath(convoyId, convoyRepoPath);
  if (resolved) return resolved;

  const root = convoyRepoPath ?? (() => {
    try { return resolveConvoyRoot(); } catch { return null; }
  })();
  let repoName = 'unknown';
  if (root) {
    const yamlPath = path.join(root, 'convoys', 'active', convoyId, 'convoy.yaml');
    if (fs.existsSync(yamlPath)) {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      const m = content.match(/^\s*target_repo:\s*["']?([^"'\n]+)["']?/m);
      if (m) repoName = m[1].trim();
    }
  }

  console.error(
    `\nCONDUIT: cannot resolve target repo '${repoName}' for convoy '${convoyId}'.\n` +
    `  To fix, do ONE of the following:\n` +
    `    1. Clone the repo and run 'conduit context' from inside it:\n` +
    `       git clone <repo-url>  &&  cd ${repoName}  &&  conduit context\n` +
    `    2. Manually register the repo path:\n` +
    `       Add "${repoName}": "/absolute/path/to/${repoName}" to ~/.conduit/config.json repos[]\n`
  );

  return null;
}

// SEC-M2: convoy IDs are used as path segments — reject anything that could
// escape the convoys/active/ directory (path traversal, shell metacharacters).
const CONVOY_ID_RE = /^[A-Za-z0-9._-]+$/;

export class InvalidConvoyIdError extends Error {
  constructor(id: string) {
    super(`invalid convoy ID "${id}" — must match [A-Za-z0-9._-]+`);
    this.name = 'InvalidConvoyIdError';
  }
}

export function validateConvoyId(id: string): void {
  if (!id || !CONVOY_ID_RE.test(id) || id === '.' || id === '..') throw new InvalidConvoyIdError(id);
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[—–]/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export function deriveConvoyID(title: string, repoPath: string): string {
  const slug = slugifyTitle(title);
  if (!slug) throw new Error('CONDUIT: convoy title must produce a non-empty slug for the convoy ID');
  const taken = new Set<string>();
  for (const subdir of ['active', 'archive']) {
    const root = path.join(repoPath, 'convoys', subdir);
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) taken.add(entry.name);
    }
  }
  if (!taken.has(slug)) return slug;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${slug}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`CONDUIT: convoy slug "${slug}" and all suffixes up to -99 are taken`);
}

export function nextConvoyID(repoPath: string): string {
  let maxID = 0;
  for (const subdir of ['active', 'archive']) {
    const root = path.join(repoPath, 'convoys', subdir);
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith('CNV-')) continue;
      const value = parseInt(entry.name.slice(4), 10);
      if (!isNaN(value) && value > maxID) maxID = value;
    }
  }
  return `CNV-${String(maxID + 1).padStart(4, '0')}`;
}
