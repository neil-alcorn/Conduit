// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/gate-request-commit.test.ts
// description: End-to-end tests for `conduit gate request` commit discipline
//              (CLI-1). Exercises AC-1/AC-1a/AC-2/AC-3/AC-3a/AC-4 against a
//              real temp git repo with a bare-remote upstream so the
//              peer-clone verifiability assertion is faithful.
// owner:       BOTH
// update:      Manual when gate-request discipline contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGate } from '../commands/gate.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals
\`\`\`yaml
operational_status: ACTIVE
system_class: MODERN
escalation_contacts:
  owner: owner
  architect: architect
  security: security
  compliance: compliance
  specialist: specialist
audience_defaults:
  field_agent: 1
  customer: 1
  employee: 1
  vendor_partner: 1
highway_init_date: 2026-04-07
last_context_update: 2026-04-07
\`\`\`
`;

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}

interface Fixture {
  remote: string;
  repo: string;
  convoyId: string;
  convoyDir: string;
  auditDir: string;
  cleanup: () => void;
}

function makeFixture(label: string, opts: { withRemote?: boolean } = {}): Fixture {
  const withRemote = opts.withRemote ?? true;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `conduit-greq-${label}-`));
  const remote = path.join(base, 'remote.git');
  const repo = path.join(base, 'repo');
  const convoyId = 'cnv-disc-001';

  if (withRemote) {
    fs.mkdirSync(remote);
    git(remote, 'init --bare -b master');
  }

  fs.mkdirSync(repo);
  git(repo, 'init -b master');
  git(repo, 'config user.email test@conduit.local');
  git(repo, 'config user.name conduit-test');

  fs.writeFileSync(path.join(repo, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  git(repo, 'add CONDUIT.md');
  git(repo, 'commit -m initial');

  if (withRemote) {
    git(repo, `remote add origin "${remote}"`);
    git(repo, 'push -u origin master');
  }

  // Convoy structure
  const convoyDir = path.join(repo, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'),
    `id: "${convoyId}"\nstage: 2\nstatus: active\nwork_type: net-new\n`, 'utf-8');
  fs.writeFileSync(path.join(convoyDir, 'living-spec.md'), '# living spec\n', 'utf-8');

  const wsDir = path.join(convoyDir, 'workstreams', 'ws1');
  fs.mkdirSync(wsDir, { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'ACCEPTANCE.md'), '# AC\n', 'utf-8');

  const auditDir = path.join(convoyDir, 'audit');
  fs.mkdirSync(auditDir, { recursive: true });

  // Commit the convoy scaffolding so the only "uncommitted" state in tests is
  // what each test deliberately introduces.
  git(repo, 'add -A');
  git(repo, 'commit -m "scaffold convoy"');
  if (withRemote) git(repo, 'push');

  const cleanup = (): void => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  return { remote, repo, convoyId, convoyDir, auditDir, cleanup };
}

function writeAndCommit(repoPath: string, relPath: string, content: string, msg: string, push = true): void {
  const abs = path.join(repoPath, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  git(repoPath, `add -- "${relPath.replace(/\\/g, '/')}"`);
  git(repoPath, `commit -m "${msg}"`);
  if (push) {
    try { git(repoPath, 'push'); } catch { /* ignore for no-upstream fixtures */ }
  }
}

function writeOnly(repoPath: string, relPath: string, content: string): void {
  const abs = path.join(repoPath, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function headSha(repoPath: string): string {
  return git(repoPath, 'rev-parse HEAD');
}

describe('gate request — AC-1 fail-fast on uncommitted request file', () => {
  it('rejects when request file is untracked', async () => {
    const fx = makeFixture('ac1-untracked');
    try {
      const reqRel = `convoys/active/${fx.convoyId}/audit/gate-3-request.md`;
      writeOnly(fx.repo, reqRel, '# gate 3 request\n\nno references.\n');
      await assert.rejects(
        () => runGate(['request', fx.convoyId, 'gate-3', '--request', path.join(fx.repo, reqRel), '--repo', fx.repo]),
        /uncommitted/,
      );
      // No gate_requested event should have been written
      const events = path.join(fx.convoyDir, 'events.jsonl');
      assert.equal(fs.existsSync(events) && fs.readFileSync(events, 'utf-8').includes('gate_requested'), false);
    } finally {
      fx.cleanup();
    }
  });

  it('rejects when request file is tracked but modified', async () => {
    const fx = makeFixture('ac1-modified');
    try {
      const reqRel = `convoys/active/${fx.convoyId}/audit/gate-3-request.md`;
      writeAndCommit(fx.repo, reqRel, '# gate 3 request v1\n', 'commit request v1');
      // Now modify without committing
      fs.writeFileSync(path.join(fx.repo, reqRel), '# gate 3 request v1\n\nlocal edit\n', 'utf-8');
      await assert.rejects(
        () => runGate(['request', fx.convoyId, 'gate-3', '--request', path.join(fx.repo, reqRel), '--repo', fx.repo]),
        /uncommitted/,
      );
    } finally {
      fx.cleanup();
    }
  });
});

describe('gate request — AC-2 fail-fast on uncommitted referenced artifact', () => {
  it('rejects when an audit/** link target is uncommitted; error mentions the artifact', async () => {
    const fx = makeFixture('ac2-ref-uncommitted');
    try {
      // Referenced artifact: present but NOT committed
      writeOnly(fx.repo, `convoys/active/${fx.convoyId}/audit/qa-unit.md`, '# qa-unit\n');

      const reqRel = `convoys/active/${fx.convoyId}/audit/gate-4-request.md`;
      writeAndCommit(fx.repo, reqRel, '# gate 4 request\n\nsee [qa-unit](qa-unit.md)\n', 'commit request');

      await assert.rejects(
        () => runGate(['request', fx.convoyId, 'gate-4', '--request', path.join(fx.repo, reqRel), '--repo', fx.repo]),
        /qa-unit\.md/,
      );
    } finally {
      fx.cleanup();
    }
  });

  it('does NOT enforce on links that resolve outside audit/**', async () => {
    const fx = makeFixture('ac2-out-of-scope');
    try {
      const reqRel = `convoys/active/${fx.convoyId}/audit/gate-4-request.md`;
      // Link that resolves outside audit/, plus an absolute URL — neither should trigger AC-2.
      const body = '# gate 4\n\nsee [external](https://example.com/page) and [up](../../shared/notes.md)\n';
      writeAndCommit(fx.repo, reqRel, body, 'commit request');
      // Should succeed — out-of-scope links are silently dropped at filterAuditLinks.
      await runGate(['request', fx.convoyId, 'gate-4', '--request', path.join(fx.repo, reqRel), '--repo', fx.repo]);
      // gate_context-2.md should have been written (existing handler behavior on stage 2)
      assert.ok(fs.existsSync(path.join(fx.convoyDir, 'audit', 'gate-context-2.md')));
    } finally {
      fx.cleanup();
    }
  });
});

describe('gate request — AC-1a / AC-3 --auto-commit', () => {
  it('commits request file + referenced artifact with the exact AC-3 message and pushes', async () => {
    const fx = makeFixture('ac3-happy');
    try {
      writeOnly(fx.repo, `convoys/active/${fx.convoyId}/audit/qa-unit.md`, '# qa-unit\n');
      const reqRel = `convoys/active/${fx.convoyId}/audit/gate-4-request.md`;
      writeOnly(fx.repo, reqRel, '# gate 4\n\nsee [qa-unit](qa-unit.md)\n');

      await runGate(['request', fx.convoyId, 'gate-4', '--request', path.join(fx.repo, reqRel), '--auto-commit', '--repo', fx.repo]);

      // The discipline auto-commit message should match AC-3 exactly.
      const expected = `audit(${fx.convoyId}): commit gate-2-request and referenced artifacts`;
      const log = git(fx.repo, 'log --pretty=%s -n 5');
      assert.ok(log.includes(expected), `expected commit message in log:\n${log}`);

      // Both files should now be tracked + committed.
      assert.equal(git(fx.repo, `ls-files -- "${reqRel.replace(/\\/g, '/')}"`),
        reqRel.replace(/\\/g, '/'));
      assert.equal(git(fx.repo, `ls-files -- "convoys/active/${fx.convoyId}/audit/qa-unit.md"`),
        `convoys/active/${fx.convoyId}/audit/qa-unit.md`);

      // Push should have made it to origin: clone the bare remote and check.
      const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-greq-clone-'));
      git(cloneDir, `clone "${fx.remote}" check`);
      const checkRoot = path.join(cloneDir, 'check');
      assert.ok(fs.existsSync(path.join(checkRoot, reqRel)));
      assert.ok(fs.existsSync(path.join(checkRoot, 'convoys', 'active', fx.convoyId, 'audit', 'qa-unit.md')));
      try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch { /* ignore */ }
    } finally {
      fx.cleanup();
    }
  });

  it('AC-3a preserves pre-existing dirty unrelated file', async () => {
    const fx = makeFixture('ac3a-dirty-preserved');
    try {
      // Track an unrelated file then dirty it without committing.
      writeAndCommit(fx.repo, 'unrelated.md', 'v1\n', 'commit unrelated v1');
      fs.writeFileSync(path.join(fx.repo, 'unrelated.md'), 'v1\nlocal edit\n', 'utf-8');

      // Setup uncommitted request + referenced artifact.
      writeOnly(fx.repo, `convoys/active/${fx.convoyId}/audit/qa-unit.md`, '# qa-unit\n');
      const reqRel = `convoys/active/${fx.convoyId}/audit/gate-4-request.md`;
      writeOnly(fx.repo, reqRel, '# gate 4\n\nsee [qa-unit](qa-unit.md)\n');

      await runGate(['request', fx.convoyId, 'gate-4', '--request', path.join(fx.repo, reqRel), '--auto-commit', '--repo', fx.repo]);

      // unrelated.md must still be uncommitted (dirty) afterwards.
      const status = git(fx.repo, 'status --porcelain -- unrelated.md');
      assert.match(status, /^\s?M\s+unrelated\.md/);
    } finally {
      fx.cleanup();
    }
  });
});

describe('gate request — AC-3 push failure surfaces and retains local commit', () => {
  it('rejects with no-upstream message and the local commit remains', async () => {
    const fx = makeFixture('ac3-no-upstream', { withRemote: false });
    try {
      const reqRel = `convoys/active/${fx.convoyId}/audit/gate-3-request.md`;
      writeOnly(fx.repo, reqRel, '# gate 3\n');

      const headBefore = headSha(fx.repo);

      await assert.rejects(
        () => runGate(['request', fx.convoyId, 'gate-3', '--request', path.join(fx.repo, reqRel), '--auto-commit', '--repo', fx.repo]),
        /no upstream|push/,
      );

      // Local commit should be retained — HEAD must have advanced past pre-call sha.
      const headAfter = headSha(fx.repo);
      assert.notEqual(headAfter, headBefore, 'local commit was not retained after push failure');
    } finally {
      fx.cleanup();
    }
  });
});

describe('gate request — LEARNING CHECK hook (AC-7 / AC-17)', () => {
  it('prints LEARNING CHECK after successful gate-context assembly without affecting the gate_requested event', async () => {
    const fx = makeFixture('ac7-learning-check');
    try {
      const reqRel = `convoys/active/${fx.convoyId}/audit/gate-2-request.md`;
      writeAndCommit(fx.repo, reqRel, '# gate 2 request\n', 'commit request');

      const lines: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); origLog(...args); };
      try {
        await runGate(['request', fx.convoyId, 'gate-2', '--request', path.join(fx.repo, reqRel), '--repo', fx.repo]);
      } finally {
        console.log = origLog;
      }

      assert.ok(lines.some(l => l.includes('LEARNING CHECK')), 'LEARNING CHECK must appear after successful gate request');
      // AC-17: gate_requested event must still be recorded regardless of hook
      const events = fs.readFileSync(path.join(fx.convoyDir, 'events.jsonl'), 'utf-8');
      assert.ok(events.includes('gate_requested'));
    } finally {
      fx.cleanup();
    }
  });
});

describe('gate request — AC-4 peer-clone verifiability (load-bearing)', () => {
  it('after gate request reports success, every audit/** link target is present on a fresh clone', async () => {
    const fx = makeFixture('ac4-peer-clone');
    try {
      // Multiple referenced artifacts, all uncommitted at start.
      writeOnly(fx.repo, `convoys/active/${fx.convoyId}/audit/qa-unit.md`, '# qa-unit\n');
      writeOnly(fx.repo, `convoys/active/${fx.convoyId}/audit/qa-security.md`, '# qa-security\n');
      const reqRel = `convoys/active/${fx.convoyId}/audit/gate-5-request.md`;
      writeOnly(fx.repo, reqRel, [
        '# gate 5 request',
        '',
        'See [qa-unit](qa-unit.md) and [qa-security](qa-security.md).',
        'Out of scope: [external](https://example.com/x).',
      ].join('\n'));

      await runGate(['request', fx.convoyId, 'gate-5', '--request', path.join(fx.repo, reqRel), '--auto-commit', '--repo', fx.repo]);

      // Peer clone — the literal failure mode the convoy was created to fix.
      const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-greq-peer-'));
      git(cloneDir, `clone "${fx.remote}" peer`);
      const peerRoot = path.join(cloneDir, 'peer');

      const cloneAuditDir = path.join(peerRoot, 'convoys', 'active', fx.convoyId, 'audit');
      const reqOnPeer = path.join(cloneAuditDir, 'gate-5-request.md');
      assert.ok(fs.existsSync(reqOnPeer), 'request file missing on peer clone');

      // Cat request, walk every audit/** link, assert each is present locally.
      const peerReqBody = fs.readFileSync(reqOnPeer, 'utf-8');
      const inlineLinks = [...peerReqBody.matchAll(/\[(?:[^\]]*)\]\(([^\s)]+)\)/g)].map(m => m[1]);
      const auditLinks = inlineLinks.filter(l => !/^[a-z]+:\/\//i.test(l));
      assert.ok(auditLinks.length > 0, 'no audit-tree links found on peer clone — fixture wrong');
      for (const link of auditLinks) {
        const target = path.resolve(path.dirname(reqOnPeer), link);
        assert.ok(fs.existsSync(target), `referenced artifact missing on peer clone: ${target}`);
      }

      try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch { /* ignore */ }
    } finally {
      fx.cleanup();
    }
  });
});
