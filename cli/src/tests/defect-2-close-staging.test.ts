// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/defect-2-close-staging.test.ts
// description: Defect #2 regression — verifies that `convoy close` stages
//              both sides of the active→archive rename in a single commit
//              so the working tree is clean post-close (C-2). Without the
//              fix, archive additions are committed but active deletions
//              remain unstaged, producing dirty-tree warnings on the next
//              CLI invocation.
// owner:       BOTH
// update:      Manual when defect #2 contract changes.
// schema:      none
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runConvoy } from '../commands/convoy.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}

interface Fixture {
  dir: string;
  convoyId: string;
  cleanup: () => void;
}

function makeGitRepoFixture(label: string, convoyId: string, stage: number): Fixture {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-d2-${label}-`));
  fs.writeFileSync(path.join(base, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  fs.mkdirSync(path.join(base, 'convoys'), { recursive: true });
  fs.writeFileSync(
    path.join(base, 'convoys', 'registry.yaml'),
    'convoys:\n  active: []\n  archived: []\n',
    'utf-8',
  );

  // Seed an active convoy
  const convoyDir = path.join(base, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  const yamlContent =
    `# ── CONDUIT MANAGED FILE ────────────────────────────────────────────\n` +
    `# last_update: 2026-05-03\n` +
    `# ─────────────────────────────────────────────────────────────────────\n` +
    `id: "${convoyId}"\n` +
    `stage: ${stage}\n` +
    `status: active\n`;
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'), yamlContent, 'utf-8');
  fs.writeFileSync(path.join(convoyDir, 'living-spec.md'), `# ${convoyId}\nseed content\n`, 'utf-8');

  // Initialize git repo and commit seed
  git(base, 'init -b master');
  git(base, 'config user.email d2@test.example');
  git(base, 'config user.name d2-test');
  git(base, 'add -A');
  git(base, 'commit -m "seed convoy"');

  // Seed a gate_passed for gate-8 so close --released is allowed
  appendConvoyEvent(
    { ts: new Date().toISOString(), type: 'gate_passed', convoy: convoyId, gate: 'gate-8', stage: 8, approver: 'd2-test' },
    convoyDir,
  );
  // Commit that addition so the tree is clean before close runs
  git(base, 'add -A');
  git(base, 'commit -m "seed gate-8 event"');

  return {
    dir: base,
    convoyId,
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

describe('defect #2 — convoy close stages both rename sides', () => {
  it('C-2: post-close `git status --porcelain` is empty (no unstaged active/ deletions)', async () => {
    const fx = makeGitRepoFixture('clean-tree', 'cnv-d2-001', 8);
    try {
      await runConvoy(['close', fx.convoyId, '--repo', fx.dir]);

      // Both sides of the rename should be committed atomically
      const status = git(fx.dir, 'status --porcelain');
      assert.equal(status, '',
        `expected clean working tree post-close, got:\n${status}`);

      // Sanity checks: active dir gone, archive dir present
      assert.equal(fs.existsSync(path.join(fx.dir, 'convoys', 'active', fx.convoyId)), false);
      assert.equal(fs.existsSync(path.join(fx.dir, 'convoys', 'archive', fx.convoyId)), true);
    } finally {
      fx.cleanup();
    }
  });

  it('post-close, the archive add and active delete are in the SAME commit', async () => {
    const fx = makeGitRepoFixture('one-commit', 'cnv-d2-002', 8);
    try {
      const beforeSha = git(fx.dir, 'rev-parse HEAD');
      await runConvoy(['close', fx.convoyId, '--repo', fx.dir]);
      const afterSha = git(fx.dir, 'rev-parse HEAD');

      // Exactly one new commit (the close commit)
      const commits = git(fx.dir, `rev-list --count ${beforeSha}..${afterSha}`);
      assert.equal(commits, '1', `expected exactly one new commit, got ${commits}`);

      // That single commit changes both the active and archive paths
      const changedFiles = git(fx.dir, `show --name-only --pretty=format: ${afterSha}`)
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const touchesActive = changedFiles.some(f => f.includes(`convoys/active/${fx.convoyId}`));
      const touchesArchive = changedFiles.some(f => f.includes(`convoys/archive/${fx.convoyId}`));

      assert.ok(touchesActive,
        `close commit must include the active/ deletion; changed files: ${changedFiles.join(', ')}`);
      assert.ok(touchesArchive,
        `close commit must include the archive/ addition; changed files: ${changedFiles.join(', ')}`);
    } finally {
      fx.cleanup();
    }
  });

  it('P-2: archive contents and convoy_closed event are still produced (existing behavior preserved)', async () => {
    const fx = makeGitRepoFixture('preserve', 'cnv-d2-003', 8);
    try {
      await runConvoy(['close', fx.convoyId, '--repo', fx.dir]);

      const archivedYaml = fs.readFileSync(
        path.join(fx.dir, 'convoys', 'archive', fx.convoyId, 'convoy.yaml'),
        'utf-8',
      );
      assert.match(archivedYaml, /^status:\s*released/m);

      // events.jsonl should contain a convoy_closed event
      const events = fs.readFileSync(
        path.join(fx.dir, 'convoys', 'archive', fx.convoyId, 'events.jsonl'),
        'utf-8',
      );
      assert.ok(events.includes('"convoy_closed"'),
        'convoy_closed event must still be appended to events.jsonl on close');
    } finally {
      fx.cleanup();
    }
  });
});
