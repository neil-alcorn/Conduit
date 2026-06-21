// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/git-sync.ts
// description: Git sync helpers — preflight pull, auto-commit, push with retry,
//              inspection, single-path commit discipline (CLI-1 / AC-1/AC-2/AC-3).
//              All git invocations in this module use execFileSync(gitBin(),
//              [argv]) so interpolated values can never reach a shell.
//              Migrated in three passes: defect #4 (gitRun + 8 helpers +
//              isCommittedAndClean, conduit-cli-hardening-2 wave 2a 2026-05-03);
//              SEC-1 (pushApproveToMaster, in-stage Stage 5 remediation
//              2026-05-04); followons #8 (residual gitSync, commitAndPushPathspecs,
//              pushWithRetry, gitPull migrated 2026-05-04 — closing the
//              local-CLI defense-in-depth surface entirely).
// owner:       BOTH
// update:      Manual as git sync behavior changes.
// schema:      none
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isHeadless } from './headless-io.js';
import { headlessEvent } from './headless-output.js';

// ── Headless commit attribution (headless-protocol §f / AC-4, AC-17) ──

let _identityWarned = false;

/** Resolve the CI identity for headless commits, in priority order:
 *  GITHUB_ACTOR → conduit-headless@local (with a one-time JSON warning on
 *  stderr). */
export function resolveHeadlessIdentity(): { name: string; email: string } {
  const ghActor = process.env.GITHUB_ACTOR;
  if (ghActor) return { name: ghActor, email: `${ghActor}@users.noreply.github.com` };

  if (!_identityWarned) {
    _identityWarned = true;
    headlessEvent('warning', { message: 'no CI identity env var found; using conduit-headless@local' });
  }
  return { name: 'conduit-headless', email: 'conduit-headless@local' };
}

/** Build the `git commit` argv. Headless runs get the `conduit (headless): `
 *  message prefix and a per-invocation `-c user.name/-c user.email` identity
 *  so the audit trail distinguishes automation commits from human sessions.
 *  Interactive runs are byte-for-byte unchanged. */
function commitArgv(message: string): string[] {
  if (!isHeadless()) return ['commit', '-m', message];
  const id = resolveHeadlessIdentity();
  return ['-c', `user.name=${id.name}`, '-c', `user.email=${id.email}`, 'commit', '-m', `conduit (headless): ${message}`];
}

/** Custom error thrown by preflightSync when the working tree has diverged
 *  from origin/master. The CLI catches this and exits with a clear recovery
 *  message rather than proceeding with a commit that would create unreconcilable
 *  history for teammates. */
export class GitDivergenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitDivergenceError';
  }
}

/** Custom error thrown by assertApprovablePush() when a `gate approve` push
 *  cannot land on origin/master safely. Defect #1: catches the cases where
 *  HEAD is on a branch whose history is not a descendant of origin/master,
 *  so a `git push origin HEAD:master` would either fail or silently land
 *  the approval somewhere it shouldn't. */
export class GateApproveBranchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GateApproveBranchError';
  }
}

/** Resolve the git executable. Uses GIT_PATH env var if set, otherwise 'git'. */
function gitBin(): string {
  return process.env.GIT_PATH || 'git';
}

/** Strip embedded credentials (https://user:token@host) from git output
 *  before it reaches console warnings, returned error strings, or the
 *  headless error envelope — CI remotes commonly embed tokens in the origin
 *  URL and git repeats that URL in push failures (Stage-5 finding SEC-M1). */
export function scrubCredentials(text: string): string {
  return text.replace(/(https?:\/\/)[^@/\s]+@/gi, '$1***@');
}

/** Is the given path the root of a git working tree? */
export function isGitRepo(repoPath: string): boolean {
  return fs.existsSync(path.join(repoPath, '.git'));
}

// Under parallel test load the 15s default can flake; widen to 60s when tests
// signal via CONDUIT_TEST. Explicit caller timeouts always win.
const GIT_TIMEOUT_MS = process.env.CONDUIT_TEST ? 60_000 : 15_000;

/** Run a git command and return its stdout, trimmed. Throws on non-zero exit.
 *  Defect #4 (Stage 2): args is `string[]` — passed as argv to execFileSync,
 *  never to a shell. Callers must split their command into argv tokens. */
function gitRun(repoPath: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): string {
  return execFileSync(gitBin(), args, {
    cwd: repoPath,
    stdio: 'pipe',
    timeout: timeoutMs,
  }).toString().trim();
}

/** Run a git command, returning its stdout on success or null on failure. Does
 *  not throw. Useful when the absence of information is itself informative. */
function gitRunSoft(repoPath: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): string | null {
  try {
    return gitRun(repoPath, args, timeoutMs);
  } catch {
    return null;
  }
}

/** Name of the currently checked-out branch. Returns null if HEAD is detached
 *  or not a git repo. */
export function currentBranch(repoPath: string): string | null {
  if (!isGitRepo(repoPath)) return null;
  return gitRunSoft(repoPath, ['symbolic-ref', '--short', 'HEAD']);
}

/** Remote default branch name (e.g. 'main' or 'master'), resolved from
 *  origin/HEAD. Falls back to 'master' for legacy repos where
 *  origin/HEAD is not set. */
export function defaultBranch(repoPath: string): string {
  if (!isGitRepo(repoPath)) return 'master';
  const ref = gitRunSoft(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (ref) {
    const slash = ref.lastIndexOf('/');
    return slash >= 0 ? ref.slice(slash + 1) : ref;
  }
  return 'master';
}

/** Count commits in revision spec `<from>..<to>` (left to right). Returns 0 on
 *  error — callers should treat that as "unknown, assume clean" rather than
 *  blocking. */
export function countCommits(repoPath: string, rev: string): number {
  const out = gitRunSoft(repoPath, ['rev-list', '--count', rev]);
  if (!out) return 0;
  const n = parseInt(out, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Any unstaged or staged changes in the working tree? */
export function hasUncommittedChanges(repoPath: string): boolean {
  const out = workingTreeStatus(repoPath);
  return out !== null && out.length > 0;
}

/** Raw porcelain status, or null when git status cannot be inspected. */
export function workingTreeStatus(repoPath: string): string | null {
  if (!isGitRepo(repoPath)) return null;
  return gitRunSoft(repoPath, ['status', '--porcelain']);
}

/** git config user.email for the current repo, or null if unset. */
export function configEmail(repoPath: string): string | null {
  if (!isGitRepo(repoPath)) return null;
  return gitRunSoft(repoPath, ['config', 'user.email']);
}

/** Read the tracking branch for the current HEAD (e.g. "origin/master").
 *  Returns null if HEAD has no upstream. */
export function upstreamBranch(repoPath: string): string | null {
  return gitRunSoft(repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
}

/**
 * Pre-flight sync before any state-mutating CLI command.
 *
 * Fetches origin and verifies the local branch is not behind the tracked
 * upstream. If the local branch is strictly behind (remote has new commits),
 * attempts a fast-forward merge automatically. If the local and remote have
 * diverged (both sides have unique commits), throws GitDivergenceError with
 * a clear recovery message.
 *
 * Silently no-ops when:
 *   - The path is not a git repo (e.g. running conduit against a plain dir).
 *   - HEAD has no upstream configured (detached HEAD, fresh branch, etc).
 *   - The fetch itself fails (offline, auth issue) — we prefer to let the
 *     user proceed locally rather than block on a transient network error.
 *
 * This is the primary defense against the "teammate ran conduit commands on
 * a stale checkout and auto-commits diverged" failure mode.
 *
 * @param repoPath - Path to the conduit repo root
 * @param commandName - Name of the CLI command triggering this check (used
 *                      only in the error message to guide the user)
 */
export function preflightSync(repoPath: string, commandName: string): void {
  if (!isGitRepo(repoPath)) return;

  const upstream = upstreamBranch(repoPath);
  if (!upstream) return;

  // Fetch the upstream ref. Tolerate fetch failures — they usually mean offline
  // or auth problems, and blocking the user in those cases is worse than letting
  // them work locally.
  try {
    // parse "origin/master" into remote + branch
    const slash = upstream.indexOf('/');
    if (slash < 1) return;
    const remote = upstream.slice(0, slash);
    const branch = upstream.slice(slash + 1);
    gitRun(repoPath, ['fetch', remote, branch], 15000);
  } catch {
    console.warn(`  [git] warn: fetch failed during preflight — proceeding with local state`);
    return;
  }

  const behind = countCommits(repoPath, `HEAD..${upstream}`);
  const ahead = countCommits(repoPath, `${upstream}..HEAD`);

  if (behind === 0) return; // already up to date or only ahead — safe to proceed

  if (ahead === 0) {
    // Pure fast-forward — auto-apply it and proceed
    try {
      gitRun(repoPath, ['merge', '--ff-only', upstream]);
      console.log(`  [git] preflight: fast-forwarded ${behind} commit${behind === 1 ? '' : 's'} from ${upstream}`);
      return;
    } catch (e: any) {
      throw new GitDivergenceError(
        `preflight fast-forward failed despite clean ahead=0 — ${e.message ?? 'unknown git error'}`,
      );
    }
  }

  // Ahead > 0 and behind > 0 — diverged. Refuse.
  throw new GitDivergenceError(
    [
      `CONDUIT: your conduit checkout has diverged from ${upstream}.`,
      `  - your local branch is ${ahead} commit${ahead === 1 ? '' : 's'} ahead`,
      `  - ${upstream} is ${behind} commit${behind === 1 ? '' : 's'} ahead`,
      ``,
      `Refusing to run '${commandName}' — proceeding would create history your teammates`,
      `cannot reconcile.  Recover with one of:`,
      ``,
      `  1) Rebase your local commits onto the remote (usual path):`,
      `       git pull --rebase`,
      ``,
      `  2) If your local commits are throwaway, reset to remote (destructive):`,
      `       git branch backup-before-reset`,
      `       git reset --hard ${upstream}`,
      ``,
      `  3) Sidestep and work on a fresh branch off remote:`,
      `       git switch -c work-${Date.now()} ${upstream}`,
      ``,
      `Run 'conduit doctor' anytime to inspect your current repo state.`,
    ].join('\n'),
  );
}

/** Push current HEAD to its upstream, transparently rebasing and retrying once
 *  if the remote rejected a non-fast-forward. Returns true if the push ultimately
 *  succeeded, false if it couldn't (conflict, network, etc). Never throws. */
export function pushWithRetry(repoPath: string): boolean {
  // First attempt
  try {
    execFileSync(gitBin(), ['push'], { cwd: repoPath, stdio: 'pipe', timeout: 30000 });
    return true;
  } catch (firstErr: any) {
    const msg = (firstErr?.stderr?.toString() || firstErr?.message || '') as string;
    const isNonFastForward =
      /non-fast-forward|rejected|fetch first|updates were rejected/i.test(msg);
    if (!isNonFastForward) {
      console.warn(`  [git] warn: push failed — ${scrubCredentials(msg.split('\n')[0])}`);
      return false;
    }
  }

  // Race detected. Fetch + rebase the one auto-commit onto the new upstream tip,
  // then retry the push exactly once. If the rebase hits a real conflict, abort
  // it cleanly and surface the problem rather than leaving the repo in a
  // rebase-in-progress state.
  console.log(`  [git] push rejected — attempting rebase onto updated remote`);
  try {
    const upstream = upstreamBranch(repoPath);
    if (!upstream) {
      console.warn(`  [git] warn: no upstream configured — cannot rebase + retry`);
      return false;
    }
    gitRun(repoPath, ['fetch', upstream.split('/').slice(0, 1).join(''), upstream.split('/').slice(1).join('/')]);
    try {
      gitRun(repoPath, ['rebase', upstream]);
    } catch (rebaseErr: any) {
      const rMsg = (rebaseErr?.stderr?.toString() || rebaseErr?.message || '') as string;
      // Abort any partial rebase so the repo isn't left half-merged
      gitRunSoft(repoPath, ['rebase', '--abort']);
      console.warn(
        `  [git] warn: rebase during push-retry conflicted — ${scrubCredentials(rMsg.split('\n')[0])}`,
      );
      console.warn(
        `  [git] warn: another write hit the same file concurrently; resolve manually.`,
      );
      return false;
    }
    execFileSync(gitBin(), ['push'], { cwd: repoPath, stdio: 'pipe', timeout: 30000 });
    console.log(`  [git] rebase + retry push succeeded`);
    return true;
  } catch (retryErr: any) {
    const rMsg = (retryErr?.stderr?.toString() || retryErr?.message || '') as string;
    console.warn(`  [git] warn: push retry failed — ${scrubCredentials(rMsg.split('\n')[0])}`);
    console.warn(`  [git] commit is local only — run 'git push' manually after resolving.`);
    return false;
  }
}

/**
 * Auto-commit changed convoy files and optionally push.
 * Called after gate approve, convoy new/close/pause/resume, checkpoint pass/fail.
 *
 * @param repoPath - Path to the conduit repo root
 * @param files - Array of file paths (relative to repoPath) to stage
 * @param message - Commit message
 * @param options - push: auto-push after commit (default true)
 */
export function gitSync(
  repoPath: string,
  files: string[],
  message: string,
  options?: { push?: boolean },
): void {
  const push = options?.push ?? true;

  if (!isGitRepo(repoPath)) return;

  try {
    // Stage the specific files
    for (const file of files) {
      try {
        execFileSync(gitBin(), ['add', file], { cwd: repoPath, stdio: 'pipe' });
      } catch {
        // File may not exist (deleted) — try git add -u for tracked files
        try {
          execFileSync(gitBin(), ['add', '-u', file], { cwd: repoPath, stdio: 'pipe' });
        } catch {
          // File not tracked either — skip
        }
      }
    }

    // Check if there are staged changes
    try {
      execFileSync(gitBin(), ['diff', '--cached', '--quiet'], { cwd: repoPath, stdio: 'pipe' });
      // If the above succeeds, there are no staged changes — nothing to commit
      return;
    } catch {
      // Non-zero exit = there ARE staged changes — proceed with commit
    }

    // Commit (argv form — message is literal, no shell escaping needed).
    // Headless runs get prefix + CI identity via commitArgv (§f).
    execFileSync(gitBin(), commitArgv(message), { cwd: repoPath, stdio: 'pipe' });
    console.log(`  [git] committed: ${message}`);

    // Push with retry on non-fast-forward
    if (push) {
      const ok = pushWithRetry(repoPath);
      if (ok) console.log(`  [git] pushed to remote`);
    }
  } catch (e: any) {
    console.warn(`  [git] warn: auto-commit failed — ${scrubCredentials(e.message ?? 'unknown error')}`);
    console.warn(`  [git] state changes are saved locally but not committed.`);
  }
}

/** Result of `commitAndPushPathspecs` — discriminated union so callers can
 *  surface the underlying git error to the user without exception flow. */
export type CommitAndPushResult = { ok: true } | { ok: false; error: string };

/**
 * Is the file at `filePath` git-tracked AND has zero staged + unstaged changes?
 * All three of `ls-files --error-unmatch`, `diff --quiet`, and
 * `diff --cached --quiet` must succeed for this to return true.
 *
 * Used by `conduit gate request` (CLI-1) to enforce that the request file and
 * every artifact it references in `audit/**` are present on origin before the
 * CLI assembles the gate context bundle (AC-1, AC-2, AC-4).
 */
export function isCommittedAndClean(filePath: string, repoPath: string): boolean {
  if (!isGitRepo(repoPath)) return false;
  if (gitRunSoft(repoPath, ['ls-files', '--error-unmatch', '--', filePath]) === null) return false;
  if (gitRunSoft(repoPath, ['diff', '--quiet', '--', filePath]) === null) return false;
  if (gitRunSoft(repoPath, ['diff', '--cached', '--quiet', '--', filePath]) === null) return false;
  return true;
}

/**
 * Stage each pathspec explicitly (never `git add -A` / `git add .`), commit
 * with the supplied message, then push the current branch to its tracking
 * remote. Pre-existing dirty state on other files is preserved automatically
 * because adds are path-explicit (CLI-1 / AC-3a).
 *
 * On push failure (no upstream, network error, non-fast-forward, auth) returns
 * `{ ok: false, error }` with the underlying git error attached. The local
 * commit is retained — caller decides whether to retry, push manually, or roll
 * back. Per AC-3, the CLI MUST NOT report `gate request` success without a
 * successful push.
 */
export function commitAndPushPathspecs(
  paths: string[],
  message: string,
  repoPath: string,
): CommitAndPushResult {
  if (paths.length === 0) return { ok: true };

  for (const p of paths) {
    try {
      execFileSync(gitBin(), ['add', '--', p], {
        cwd: repoPath,
        stdio: 'pipe',
        timeout: 15000,
      });
    } catch (e: any) {
      const msg = (e?.stderr?.toString() || e?.message || 'git add failed').trim();
      return { ok: false, error: `git add ${p}: ${scrubCredentials(msg)}` };
    }
  }

  try {
    // Headless runs get prefix + CI identity via commitArgv (§f).
    execFileSync(gitBin(), commitArgv(message), {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 15000,
    });
  } catch (e: any) {
    const msg = (e?.stderr?.toString() || e?.message || 'git commit failed').trim();
    return { ok: false, error: `git commit: ${scrubCredentials(msg)}` };
  }

  if (!upstreamBranch(repoPath)) {
    return {
      ok: false,
      error: 'current branch has no upstream — set with `git push --set-upstream origin <branch>` or push manually before re-running',
    };
  }

  try {
    execFileSync(gitBin(), ['push'], {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 30000,
    });
  } catch (e: any) {
    const msg = (e?.stderr?.toString() || e?.message || 'git push failed').trim();
    return { ok: false, error: `git push: ${scrubCredentials(msg)}` };
  }

  return { ok: true };
}

/**
 * Defect #1 (Stage 2 design — fail-fast hybrid preflight):
 * Verify that a `gate approve` push will land on origin/master correctly.
 *
 * Allowed when EITHER:
 *   (a) HEAD is `master` itself, OR
 *   (b) HEAD is on another branch but `origin/master` is an ancestor of HEAD
 *       (so the local commit chain descends from origin/master — which is the
 *       expected state when the second-approver-prompt template's fresh-branch
 *       sidestep is used: `git switch -c approve-gate-N origin/master`).
 *
 * Throws GateApproveBranchError when neither condition holds — typical cause
 * is a detached HEAD or a branch whose history doesn't include origin/master.
 *
 * Silently no-ops when the path is not a git repo (preserves the tolerant
 * pattern used elsewhere in this module).
 */
export function assertApprovablePush(repoPath: string): void {
  if (!isGitRepo(repoPath)) return;

  const def = defaultBranch(repoPath);
  const branch = currentBranch(repoPath);
  if (branch === def) return;

  // Detached HEAD or unresolvable branch — refuse.
  if (!branch) {
    throw new GateApproveBranchError(
      [
        `CONDUIT: gate approve refused — HEAD is detached (no current branch).`,
        ``,
        `'gate approve' must run from a branch whose history descends from`,
        `origin/${def}. Recover with one of:`,
        `  1) Switch to ${def} and re-run:        git switch ${def} && git pull`,
        `  2) Switch to a fresh approve-branch:   git switch -c approve-tmp origin/${def}`,
      ].join('\n'),
    );
  }

  // Branch is not the default — check that origin/<def> is an ancestor of HEAD.
  // gitRunSoft returns null on non-zero exit; merge-base --is-ancestor exits
  // 0 when ancestor, 1 when not ancestor, 128 on error (unknown ref).
  // We treat any non-zero / null as "not an ancestor."
  const ancestorOk = gitRunSoft(repoPath, ['merge-base', '--is-ancestor', `origin/${def}`, 'HEAD']);
  if (ancestorOk !== null) return;

  throw new GateApproveBranchError(
    [
      `CONDUIT: gate approve refused — current branch '${branch}' has`,
      `diverged from origin/${def}.`,
      ``,
      `A 'gate approve' push must land on origin/${def}. Your branch's`,
      `history does not include origin/${def}, so pushing it would either`,
      `fail (non-fast-forward) or land the approval somewhere unexpected.`,
      ``,
      `Recover with one of:`,
      `  1) Switch to ${def} and re-run:`,
      `       git switch ${def} && git pull`,
      `  2) Sidestep on a fresh approve-branch off remote ${def}:`,
      `       git switch -c approve-${Date.now()} origin/${def}`,
      `       conduit gate approve <convoy> <gate>`,
    ].join('\n'),
  );
}

/**
 * Defect #1 (Stage 2 design): push the current HEAD's commit chain to
 * origin/master via the explicit refspec `HEAD:master`. This is the gate
 * approve push path — works regardless of whether the local branch is
 * master itself or a fresh approve-branch off origin/master.
 *
 * Calls assertApprovablePush() first to fail-fast on diverged HEAD before
 * any network I/O. Returns true on push success, false on push failure
 * (no upstream / network / non-FF / auth) — matches pushWithRetry's
 * never-throw contract for non-preflight failures. The preflight assertion
 * itself DOES throw GateApproveBranchError so the CLI surfaces the wrong-
 * branch case loudly.
 */
export function pushApproveToMaster(repoPath: string): boolean {
  // Preflight: fail-fast on diverged HEAD before touching the remote.
  assertApprovablePush(repoPath);

  const def = defaultBranch(repoPath);
  try {
    // Defense-in-depth: argv form so any future change to the args list cannot
    // accidentally introduce shell interpretation. SEC-1 remediation, Stage 5
    // self-evaluation 2026-05-04.
    execFileSync(gitBin(), ['push', 'origin', `HEAD:${def}`], {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 30000,
    });
    return true;
  } catch (err: any) {
    const msg = (err?.stderr?.toString() || err?.message || '') as string;
    console.warn(`  [git] warn: gate approve push to origin/${def} failed — ${scrubCredentials(msg.split('\n')[0])}`);
    console.warn(`  [git] gate approve commit is local only — resolve and push manually with: git push origin HEAD:${def}`);
    return false;
  }
}

/**
 * Pull latest changes from remote before reading state.
 * Called at the start of `conduit context` in soft mode — never throws.
 * For strict behavior before mutating commands, use preflightSync().
 */
export function gitPull(repoPath: string): void {
  if (!isGitRepo(repoPath)) return;

  try {
    execFileSync(gitBin(), ['pull', '--ff-only'], { cwd: repoPath, stdio: 'pipe', timeout: 15000 });
  } catch {
    // Pull failed (no remote, merge conflict, etc.) — continue with local state
    console.warn(`  [git] warn: auto-pull failed — working with local state`);
  }
}
