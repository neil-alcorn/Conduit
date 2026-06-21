// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/git-sync.test.ts
// description: Tests for preflightSync, push-with-retry, and git inspection helpers.
// owner:       BOTH
// update:      Manual when git sync behavior changes.
// schema:      none
// last_update: 2026-04-23
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GitDivergenceError,
  preflightSync,
  isGitRepo,
  currentBranch,
  upstreamBranch,
  countCommits,
  hasUncommittedChanges,
  configEmail,
} from '../internal/git-sync.js';

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}

/** Create a local bare "remote" + a working clone, with one shared initial
 *  commit. Returns both paths so tests can simulate multi-user divergence. */
function makeFixture(label: string): { remote: string; local: string; cleanup: () => void } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-git-${label}-`));
  const remote = path.join(base, 'remote.git');
  const seed = path.join(base, 'seed');
  const local = path.join(base, 'local');

  fs.mkdirSync(remote);
  git(remote, 'init --bare -b master');

  fs.mkdirSync(seed);
  git(seed, 'init -b master');
  git(seed, 'config user.email test@example.com');
  git(seed, 'config user.name test');
  fs.writeFileSync(path.join(seed, 'README.md'), 'init\n');
  git(seed, 'add README.md');
  git(seed, 'commit -m init');
  git(seed, `remote add origin "${remote}"`);
  git(seed, 'push -u origin master');

  git(base, `clone "${remote}" local`);
  git(local, 'config user.email test@example.com');
  git(local, 'config user.name test');

  const cleanup = () => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  return { remote, local, cleanup };
}

describe('isGitRepo', () => {
  it('returns false for non-git directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-notgit-'));
    try {
      assert.equal(isGitRepo(tmp), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns true for a real git repo', () => {
    const fx = makeFixture('isrepo');
    try {
      assert.equal(isGitRepo(fx.local), true);
    } finally {
      fx.cleanup();
    }
  });
});

describe('inspection helpers', () => {
  it('currentBranch, upstreamBranch, configEmail, countCommits on a clean clone', () => {
    const fx = makeFixture('inspect');
    try {
      assert.equal(currentBranch(fx.local), 'master');
      assert.equal(upstreamBranch(fx.local), 'origin/master');
      assert.equal(configEmail(fx.local), 'test@example.com');
      assert.equal(countCommits(fx.local, 'HEAD..origin/master'), 0);
      assert.equal(countCommits(fx.local, 'origin/master..HEAD'), 0);
      assert.equal(hasUncommittedChanges(fx.local), false);
    } finally {
      fx.cleanup();
    }
  });

  it('hasUncommittedChanges detects a dirty working tree', () => {
    const fx = makeFixture('dirty');
    try {
      fs.writeFileSync(path.join(fx.local, 'new.txt'), 'x');
      assert.equal(hasUncommittedChanges(fx.local), true);
    } finally {
      fx.cleanup();
    }
  });
});

describe('preflightSync', () => {
  it('no-ops on non-git directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-preflight-notgit-'));
    try {
      // should not throw
      preflightSync(tmp, 'gate approve');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('no-ops on a repo with no upstream', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-noremote-'));
    try {
      git(tmp, 'init -b master');
      git(tmp, 'config user.email a@b.c');
      git(tmp, 'config user.name t');
      fs.writeFileSync(path.join(tmp, 'f'), 'x');
      git(tmp, 'add f');
      git(tmp, 'commit -m c');
      // no origin configured → preflight should silently skip
      preflightSync(tmp, 'gate approve');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fast-forwards automatically when local is purely behind', () => {
    const fx = makeFixture('behind');
    try {
      // Make remote advance by cloning a separate workspace and pushing
      const advancer = path.join(path.dirname(fx.local), 'advancer');
      git(path.dirname(fx.local), `clone "${fx.remote}" advancer`);
      git(advancer, 'config user.email other@example.com');
      git(advancer, 'config user.name other');
      fs.writeFileSync(path.join(advancer, 'advanced.txt'), 'new\n');
      git(advancer, 'add advanced.txt');
      git(advancer, 'commit -m advance');
      git(advancer, 'push');

      // Local is now behind by 1 — preflight should auto-FF
      preflightSync(fx.local, 'gate approve');
      assert.ok(fs.existsSync(path.join(fx.local, 'advanced.txt')), 'FF should have brought new file into local');
    } finally {
      fx.cleanup();
    }
  });

  it('throws GitDivergenceError when local and remote have both advanced', () => {
    const fx = makeFixture('diverge');
    try {
      // Advance remote via a sibling checkout
      const advancer = path.join(path.dirname(fx.local), 'advancer');
      git(path.dirname(fx.local), `clone "${fx.remote}" advancer`);
      git(advancer, 'config user.email other@example.com');
      git(advancer, 'config user.name other');
      fs.writeFileSync(path.join(advancer, 'remote-only.txt'), 'r\n');
      git(advancer, 'add remote-only.txt');
      git(advancer, 'commit -m remote-side');
      git(advancer, 'push');

      // Advance local independently
      fs.writeFileSync(path.join(fx.local, 'local-only.txt'), 'l\n');
      git(fx.local, 'add local-only.txt');
      git(fx.local, 'commit -m local-side');

      assert.throws(
        () => preflightSync(fx.local, 'gate approve'),
        (err: unknown) => {
          if (!(err instanceof GitDivergenceError)) return false;
          assert.match(err.message, /diverged/i);
          assert.match(err.message, /gate approve/);
          assert.match(err.message, /git pull --rebase/);
          return true;
        },
      );
    } finally {
      fx.cleanup();
    }
  });
});
