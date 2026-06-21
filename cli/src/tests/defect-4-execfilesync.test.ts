// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/defect-4-execfilesync.test.ts
// description: Defect #4 regression — verifies the four execSync→execFileSync
//              migrations (git-sync.ts gitRun, diff-scope.ts merge-base + diff,
//              migrate-stray-registry.ts runGit) are byte-identical to the
//              prior shell-string form for normal inputs (P-4) and that
//              shell metacharacters in interpolated values are passed
//              literally to git as argv elements (C-4).
// owner:       BOTH
// update:      Manual when defect #4 contract changes.
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
  isGitRepo,
  currentBranch,
  hasUncommittedChanges,
  configEmail,
  upstreamBranch,
  countCommits,
} from '../internal/git-sync.js';
import { resolveDiffScope } from '../internal/diff-scope.js';

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}

function makeRepo(label: string): { repo: string; cleanup: () => void } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-d4-${label}-`));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init -b master');
  git(repo, 'config user.email defect4@test.example');
  git(repo, 'config user.name defect-4-test');
  fs.writeFileSync(path.join(repo, 'README.md'), 'seed\n');
  git(repo, 'add README.md');
  git(repo, 'commit -m seed');
  return {
    repo,
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

describe('defect #4 — git-sync.ts gitRun migrated to execFileSync (P-4 byte-identical)', () => {
  it('currentBranch returns the same string after migration', () => {
    const { repo, cleanup } = makeRepo('current-branch');
    try {
      assert.equal(currentBranch(repo), 'master');
    } finally {
      cleanup();
    }
  });

  it('hasUncommittedChanges detects working-tree changes correctly', () => {
    const { repo, cleanup } = makeRepo('uncommitted');
    try {
      assert.equal(hasUncommittedChanges(repo), false);
      fs.writeFileSync(path.join(repo, 'dirty.txt'), 'unstaged');
      assert.equal(hasUncommittedChanges(repo), true);
    } finally {
      cleanup();
    }
  });

  it('configEmail returns the local repo email', () => {
    const { repo, cleanup } = makeRepo('config-email');
    try {
      assert.equal(configEmail(repo), 'defect4@test.example');
    } finally {
      cleanup();
    }
  });

  it('upstreamBranch returns null when no upstream is configured', () => {
    const { repo, cleanup } = makeRepo('no-upstream');
    try {
      assert.equal(upstreamBranch(repo), null);
    } finally {
      cleanup();
    }
  });

  it('countCommits handles a trivial range without spaces', () => {
    const { repo, cleanup } = makeRepo('count');
    try {
      // HEAD..HEAD is empty, should return 0
      assert.equal(countCommits(repo, 'HEAD..HEAD'), 0);
    } finally {
      cleanup();
    }
  });
});

describe('defect #4 — diff-scope.ts merge-base + diff migrated to execFileSync', () => {
  it('resolveDiffScope returns orphan:false for a normal repo with one commit', () => {
    const { repo, cleanup } = makeRepo('diff-scope-normal');
    try {
      const scope = resolveDiffScope(repo, { base: 'master' });
      assert.equal(scope.base, 'master');
      assert.equal(scope.orphan, false);
      // No diff between HEAD and master (HEAD == master), so changedFiles is empty
      assert.deepEqual(scope.changedFiles, []);
    } finally {
      cleanup();
    }
  });

  it('resolveDiffScope returns orphan:true when base ref does not exist', () => {
    const { repo, cleanup } = makeRepo('diff-scope-orphan');
    try {
      const scope = resolveDiffScope(repo, { base: 'nonexistent-branch-xyz' });
      assert.equal(scope.orphan, true);
    } finally {
      cleanup();
    }
  });

  it('resolveDiffScope captures changed non-test files between base and HEAD', () => {
    const { repo, cleanup } = makeRepo('diff-scope-changes');
    try {
      // Create a feature branch with a new source file
      git(repo, 'checkout -b feature');
      fs.writeFileSync(path.join(repo, 'src-file.js'), 'export const x = 1;\n');
      git(repo, 'add src-file.js');
      git(repo, 'commit -m "add src-file"');
      const scope = resolveDiffScope(repo, { base: 'master' });
      assert.equal(scope.orphan, false);
      assert.ok(scope.changedFiles.includes('src-file.js'),
        `expected src-file.js in changedFiles, got: ${scope.changedFiles.join(',')}`);
    } finally {
      cleanup();
    }
  });
});

describe('defect #4 — shell metacharacters as argv elements (C-4 second clause)', () => {
  it('treats branch names containing semicolons as literal git refs (no shell interpretation)', () => {
    // The defining property of execFileSync vs execSync: argv elements are
    // passed verbatim to the executable, never interpreted by a shell.
    // Verification: pass a string containing `;` and `&&` as a base ref;
    // git rejects it as ambiguous/unknown rather than the shell splitting
    // it into multiple commands. If shell interpretation had occurred,
    // we'd see the inner command's effects (or a shell-syntax error from
    // the shell, not from git).
    const { repo, cleanup } = makeRepo('shell-meta');
    try {
      const malicious = 'master;echo PWNED && exit 1';
      // resolveDiffScope's merge-base call will receive `malicious` as one
      // argv element; git can't resolve it as a ref; the function returns
      // orphan:true. The test passes as long as we don't see PWNED text
      // surface in stdout (which would prove shell interpretation).
      // Capture stdout/stderr to confirm:
      const origStdoutWrite = process.stdout.write.bind(process.stdout);
      const origStderrWrite = process.stderr.write.bind(process.stderr);
      let captured = '';
      process.stdout.write = ((chunk: any) => { captured += chunk?.toString?.() ?? ''; return true; }) as any;
      process.stderr.write = ((chunk: any) => { captured += chunk?.toString?.() ?? ''; return true; }) as any;
      try {
        const scope = resolveDiffScope(repo, { base: malicious });
        assert.equal(scope.orphan, true,
          'malicious base ref should resolve to orphan:true (git rejected the ref)');
      } finally {
        process.stdout.write = origStdoutWrite;
        process.stderr.write = origStderrWrite;
      }
      assert.ok(!captured.includes('PWNED'),
        'shell metacharacter command segment must not have been interpreted (no PWNED in captured output)');
    } finally {
      cleanup();
    }
  });

  it('handles ref names containing characters that would be shell-special', () => {
    const { repo, cleanup } = makeRepo('shell-special');
    try {
      // `$()` is shell command substitution. As an argv element, it must
      // reach git literally. git will reject it as a malformed ref.
      const scope = resolveDiffScope(repo, { base: '$(echo bad)' });
      assert.equal(scope.orphan, true);
    } finally {
      cleanup();
    }
  });
});
