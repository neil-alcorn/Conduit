// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/defect-1-approve-preflight.test.ts
// description: Defect #1 regression — verifies assertApprovablePush() and
//              pushApproveToMaster() resolve the "gate approve on non-master
//              branch silently pushes feature branch" failure mode.
//              Implements C-1 (either fail-fast or land on origin/master)
//              and preserves P-1 (master HEAD happy path unchanged).
// owner:       BOTH
// update:      Manual when defect #1 contract changes.
// schema:      none
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertApprovablePush,
  pushApproveToMaster,
  GateApproveBranchError,
} from '../internal/git-sync.js';

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}

interface RemoteFixture {
  remote: string;
  local: string;
  cleanup: () => void;
}

function makeFixture(label: string): RemoteFixture {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-d1-${label}-`));
  const remote = path.join(base, 'remote.git');
  const seed = path.join(base, 'seed');
  const local = path.join(base, 'local');

  fs.mkdirSync(remote);
  git(remote, 'init --bare -b master');

  fs.mkdirSync(seed);
  git(seed, 'init -b master');
  git(seed, 'config user.email d1@test.example');
  git(seed, 'config user.name d1-test');
  fs.writeFileSync(path.join(seed, 'README.md'), 'init\n');
  git(seed, 'add README.md');
  git(seed, 'commit -m init');
  git(seed, `remote add origin "${remote}"`);
  git(seed, 'push -u origin master');

  git(base, `clone "${remote}" local`);
  git(local, 'config user.email d1@test.example');
  git(local, 'config user.name d1-test');

  return {
    remote,
    local,
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

describe('defect #1 — assertApprovablePush (preflight)', () => {
  it('P-1: returns silently when HEAD is master', () => {
    const fx = makeFixture('master-head');
    try {
      assert.doesNotThrow(() => assertApprovablePush(fx.local));
    } finally {
      fx.cleanup();
    }
  });

  it('C-1 hybrid: returns silently when HEAD is a fresh approve-branch from origin/master (origin/master is an ancestor)', () => {
    const fx = makeFixture('fresh-branch');
    try {
      // Simulate the second-approver-prompt template's fresh-branch sidestep:
      //   git switch -c approve-gate-N origin/master
      git(fx.local, 'switch -c approve-gate-2-test origin/master');
      assert.doesNotThrow(() => assertApprovablePush(fx.local));
    } finally {
      fx.cleanup();
    }
  });

  it('C-1 fail-fast: throws GateApproveBranchError when HEAD has diverged from origin/master (origin/master is NOT an ancestor)', () => {
    const fx = makeFixture('diverged');
    try {
      // Build a branch that contains a commit which origin/master does not have
      // by making a local commit after switching to a new branch with no shared
      // ancestor commit between the new branch tip and origin/master.
      // Simpler reproduction: rewrite history by force-resetting to a fresh
      // initial commit so origin/master is no longer an ancestor.
      git(fx.local, 'checkout --orphan diverged-branch');
      git(fx.local, 'rm -rf .');
      fs.writeFileSync(path.join(fx.local, 'fresh.txt'), 'unrelated\n');
      git(fx.local, 'add fresh.txt');
      git(fx.local, 'commit -m "diverged commit unrelated to master"');
      // Now HEAD's commit history shares no ancestor with origin/master
      assert.throws(
        () => assertApprovablePush(fx.local),
        (err: unknown) => {
          assert.ok(err instanceof GateApproveBranchError,
            `expected GateApproveBranchError, got ${(err as Error)?.constructor?.name}`);
          const msg = (err as Error).message;
          assert.ok(msg.includes('diverged-branch') || msg.includes('not'),
            `error message should name the branch or describe the divergence; got: ${msg}`);
          return true;
        },
      );
    } finally {
      fx.cleanup();
    }
  });

  it('returns silently when path is not a git repo (preserves existing tolerant pattern)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-d1-notgit-'));
    try {
      assert.doesNotThrow(() => assertApprovablePush(tmp));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('throws on detached HEAD (no current branch — cannot validate)', () => {
    const fx = makeFixture('detached');
    try {
      const headSha = git(fx.local, 'rev-parse HEAD');
      git(fx.local, `checkout ${headSha}`);
      assert.throws(
        () => assertApprovablePush(fx.local),
        (err: unknown) => err instanceof GateApproveBranchError,
      );
    } finally {
      fx.cleanup();
    }
  });
});

describe('defect #1 — pushApproveToMaster (HEAD:master push)', () => {
  it('P-1: pushes successfully when HEAD is master', () => {
    const fx = makeFixture('push-master');
    try {
      // Make a commit on master locally
      fs.writeFileSync(path.join(fx.local, 'approve-evidence.txt'), 'gate approval\n');
      git(fx.local, 'add approve-evidence.txt');
      git(fx.local, 'commit -m "gate approve commit"');
      const ok = pushApproveToMaster(fx.local);
      assert.equal(ok, true);
      // Verify the commit landed on remote master
      const remoteHead = git(fx.remote, 'rev-parse master');
      const localHead = git(fx.local, 'rev-parse HEAD');
      assert.equal(remoteHead, localHead);
    } finally {
      fx.cleanup();
    }
  });

  it('C-1: pushes commit from fresh approve-branch onto origin/master, not the local branch', () => {
    const fx = makeFixture('push-from-branch');
    try {
      // Simulate the sidestep flow
      git(fx.local, 'switch -c approve-gate-3-other origin/master');
      fs.writeFileSync(path.join(fx.local, 'approve-evidence.txt'), 'gate approval from branch\n');
      git(fx.local, 'add approve-evidence.txt');
      git(fx.local, 'commit -m "gate approve from approve-branch"');

      const ok = pushApproveToMaster(fx.local);
      assert.equal(ok, true);

      // Critical assertion: the commit landed on origin/master
      // (NOT on origin/approve-gate-3-other, which would be the original defect).
      const remoteMasterHead = git(fx.remote, 'rev-parse master');
      const localBranchHead = git(fx.local, 'rev-parse HEAD');
      assert.equal(remoteMasterHead, localBranchHead,
        'approve commit must reach origin/master, not the local branch ref');
    } finally {
      fx.cleanup();
    }
  });

  it('preflights — refuses to push when HEAD has diverged from origin/master', () => {
    const fx = makeFixture('push-diverged');
    try {
      git(fx.local, 'checkout --orphan diverged-x');
      git(fx.local, 'rm -rf .');
      fs.writeFileSync(path.join(fx.local, 'unrelated.txt'), 'orphan\n');
      git(fx.local, 'add unrelated.txt');
      git(fx.local, 'commit -m "diverged"');

      assert.throws(
        () => pushApproveToMaster(fx.local),
        (err: unknown) => err instanceof GateApproveBranchError,
      );
    } finally {
      fx.cleanup();
    }
  });
});
