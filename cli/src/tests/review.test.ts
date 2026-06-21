// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/review.test.ts
// description: Unit tests for conduit review command — init, show, unknown subcommand.
// owner:       BOTH
// update:      Manual when review behavior changes.
// schema:      none
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runReview } from '../commands/review.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-review-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

/** Isolate `resolveConvoyRoot()` from any real conduit central path during a test.
 *  See plan.test.ts for rationale (followons item #7). */
function isolateConduitEnv(stubDir: string): { restore: () => void } {
  const savedHome = process.env.CONDUIT_HOME;
  const savedCfg = process.env.CONDUIT_CONFIG_PATH;
  const savedLegacy = process.env.CONDUIT_LEGACY_RESOLVE;
  process.env.CONDUIT_HOME = stubDir;
  process.env.CONDUIT_CONFIG_PATH = path.join(stubDir, '.no-such-config.json');
  delete process.env.CONDUIT_LEGACY_RESOLVE;
  return {
    restore: () => {
      if (savedHome === undefined) delete process.env.CONDUIT_HOME;
      else process.env.CONDUIT_HOME = savedHome;
      if (savedCfg === undefined) delete process.env.CONDUIT_CONFIG_PATH;
      else process.env.CONDUIT_CONFIG_PATH = savedCfg;
      if (savedLegacy === undefined) delete process.env.CONDUIT_LEGACY_RESOLVE;
      else process.env.CONDUIT_LEGACY_RESOLVE = savedLegacy;
    },
  };
}

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  console.error = (...args: unknown[]) => lines.push('[err] ' + args.join(' '));
  return {
    lines,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
  };
}

// ─── runReview — no args ────────────────────────────────────────────

describe('review — no args prints usage', () => {
  it('prints usage and does not throw', async () => {
    const cap = captureConsole();
    await runReview([]);
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('usage:')));
  });
});

// ─── runReview — show without convoy ────────────────────────────────

describe('review show — no convoy', () => {
  it('throws when no active convoy exists', async () => {
    const dir = tmpDir();
    const env = isolateConduitEnv(dir);
    try {
      await assert.rejects(
        () => runReview(['show', '--repo', dir]),
        /no convoys directory found|no active convoy/
      );
    } finally {
      env.restore();
    }
  });
});

// ─── runReview — unknown subcommand ─────────────────────────────────

describe('review unknown subcommand', () => {
  it('throws with "unknown review subcommand"', async () => {
    const dir = tmpDir();
    await assert.rejects(
      () => runReview(['unknown', '--repo', dir]),
      /unknown review subcommand/
    );
  });
});

// ─── Helper: set up a convoy directory inside the tmp repo ──────────

function tmpRepoWithConvoy(convoyId: string): string {
  const dir = tmpDir();
  const convoyDir = path.join(dir, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'), `id: "${convoyId}"\ntitle: "test"\nstage: 3\nstatus: active\n`, 'utf-8');
  return dir;
}

// ─── runReview — init emits FND ID + severity vocabulary ────────────

describe('review init — findings shape', () => {
  it('scaffolds a review whose findings table has FND-NNNN id and severity vocabulary', async () => {
    const dir = tmpRepoWithConvoy('test-convoy-1');
    const cap = captureConsole();
    await runReview(['init', 'test-convoy-1', '--repo', dir]);
    cap.restore();

    const auditDir = path.join(dir, 'convoys', 'active', 'test-convoy-1', 'audit');
    assert.ok(fs.existsSync(auditDir), 'audit dir should be created');
    const reviewFiles = fs.readdirSync(auditDir).filter(f => f.startsWith('review-'));
    assert.strictEqual(reviewFiles.length, 1, 'exactly one review file created');

    const content = fs.readFileSync(path.join(auditDir, reviewFiles[0]), 'utf-8');
    assert.match(content, /FND-0001/, 'scaffold should include FND-0001 as ID placeholder');
    assert.match(content, /\bID\b/, 'findings table should have an ID column');
    assert.match(content, /blocking/, 'severity vocabulary should list "blocking"');
    assert.match(content, /major/, 'severity vocabulary should list "major"');
    assert.match(content, /minor/, 'severity vocabulary should list "minor"');
    assert.match(content, /suggestion/, 'severity vocabulary should list "suggestion"');
    assert.match(content, /receiving-review/, 'should reference receiving-review directive');
  });
});

// ─── runReview — init emits new summary-counter labels ─────────────

describe('review init — summary counters', () => {
  it('scaffolds summary section with all four severity counters', async () => {
    const dir = tmpRepoWithConvoy('counters-convoy');
    const cap = captureConsole();
    await runReview(['init', 'counters-convoy', '--repo', dir]);
    cap.restore();

    const auditDir = path.join(dir, 'convoys', 'active', 'counters-convoy', 'audit');
    const reviewFiles = fs.readdirSync(auditDir).filter(f => f.startsWith('review-'));
    const content = fs.readFileSync(path.join(auditDir, reviewFiles[0]), 'utf-8');

    assert.match(content, /\*\*Blocking:\*\*/, 'summary should contain Blocking counter');
    assert.match(content, /\*\*Major:\*\*/, 'summary should contain Major counter');
    assert.match(content, /\*\*Minor:\*\*/, 'summary should contain Minor counter');
    assert.match(content, /\*\*Suggestion:\*\*/, 'summary should contain Suggestion counter');
  });
});

// ─── runReview — show reads new Blocking counter (FND-0003 fix) ─────

describe('review show — reads new Blocking counter', () => {
  it('displays blocking count for new-template reviews', async () => {
    const dir = tmpRepoWithConvoy('show-convoy');
    const auditDir = path.join(dir, 'convoys', 'active', 'show-convoy', 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    const newReview = `# Code Review: REV-000042

## Status: complete

## Summary

- **Total findings:** 3
- **Blocking:** 2
- **Major:** 1
- **Minor:** 0
- **Suggestion:** 0
`;
    fs.writeFileSync(path.join(auditDir, 'review-000042.md'), newReview, 'utf-8');

    const cap = captureConsole();
    await runReview(['show', 'show-convoy', '--repo', dir]);
    cap.restore();

    const out = cap.lines.join('\n');
    assert.match(out, /blocking:\s*2/, `show should report blocking: 2; got: ${out}`);
    assert.match(out, /findings:\s*3/, `show should report findings: 3; got: ${out}`);
  });
});

// ─── runReview — findings handles a legacy-shape review log ─────────

describe('review findings — legacy parse', () => {
  it('parses a legacy review (no ID/Severity columns) without throwing', async () => {
    const dir = tmpRepoWithConvoy('legacy-convoy');
    const auditDir = path.join(dir, 'convoys', 'active', 'legacy-convoy', 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    // Legacy shape: no ID column, no severity vocabulary — just the original 8-col table.
    const legacyReview = `# Code Review: REV-000001

## Convoy: legacy-convoy
## Status: complete

## Findings

| # | Severity | Category | File | Line | Description | Confidence | Disposition |
|---|----------|----------|------|------|-------------|------------|-------------|
| 1 | must-fix | bug | src/foo.ts | 42 | Null deref | 90 | fix-now |

## Summary

- **Total findings:** 1
- **Must-fix:** 1
`;
    fs.writeFileSync(path.join(auditDir, 'review-000001.md'), legacyReview, 'utf-8');

    const cap = captureConsole();
    await runReview(['findings', 'legacy-convoy', '--repo', dir]);
    cap.restore();

    const joined = cap.lines.join('\n');
    assert.match(joined, /Null deref/, 'legacy description should render');
    // Must not throw or crash — reaching this assertion means parse succeeded.
  });
});
