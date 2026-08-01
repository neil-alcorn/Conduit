// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/gate-council.test.ts
// description: Unit tests for council review as a four-eyes method at gates 3 and 5.
// owner:       BOTH
// update:      Manual when council-review validation changes.
// schema:      none
// last_update: 2026-07-31
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCouncilManifest } from '../commands/gate.js';

function tmpConvoy(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-council-'));
  fs.mkdirSync(path.join(dir, 'audit'), { recursive: true });
  return dir;
}

function writeArtifacts(convoyRoot: string, names: string[]): void {
  for (const n of names) {
    fs.writeFileSync(path.join(convoyRoot, 'audit', n), '# findings\n', 'utf-8');
  }
}

function manifest(convoyRoot: string, body: string): string {
  const p = path.join(convoyRoot, 'audit', 'council.yaml');
  fs.writeFileSync(p, body, 'utf-8');
  return p;
}

describe('council manifest validation', () => {
  it('accepts two reviewers on distinct models with artifacts present', () => {
    const root = tmpConvoy();
    writeArtifacts(root, ['a.md', 'b.md']);
    const p = manifest(
      root,
      `reviewers:
  - name: correctness
    model: opus
    verdict: APPROVE WITH CONDITIONS
    artifact: audit/a.md
  - name: adversarial
    model: fable
    verdict: APPROVE WITH CONDITIONS
    artifact: audit/b.md
`,
    );
    const reviewers = parseCouncilManifest(p, root);
    assert.equal(reviewers.length, 2);
    assert.equal(reviewers[0].name, 'correctness');
    assert.equal(reviewers[1].model, 'fable');
  });

  it('rejects a single reviewer — one reviewer is not a review board', () => {
    const root = tmpConvoy();
    writeArtifacts(root, ['a.md']);
    const p = manifest(root, `reviewers:\n  - name: solo\n    model: opus\n    verdict: APPROVE\n    artifact: audit/a.md\n`);
    assert.throws(() => parseCouncilManifest(p, root), /at least 2 reviewers/);
  });

  it('rejects reviewers that all ran on the same model — correlated blind spots are not independence', () => {
    const root = tmpConvoy();
    writeArtifacts(root, ['a.md', 'b.md']);
    const p = manifest(
      root,
      `reviewers:
  - name: first
    model: opus
    verdict: APPROVE
    artifact: audit/a.md
  - name: second
    model: OPUS
    verdict: APPROVE
    artifact: audit/b.md
`,
    );
    assert.throws(() => parseCouncilManifest(p, root), /DISTINCT models/);
  });

  it('rejects a reviewer whose artifact does not exist — a council cannot be declared retroactively', () => {
    const root = tmpConvoy();
    writeArtifacts(root, ['a.md']);
    const p = manifest(
      root,
      `reviewers:
  - name: real
    model: opus
    verdict: APPROVE
    artifact: audit/a.md
  - name: imaginary
    model: fable
    verdict: APPROVE
    artifact: audit/never-written.md
`,
    );
    assert.throws(() => parseCouncilManifest(p, root), /does not exist/);
  });

  it('rejects an incomplete entry', () => {
    const root = tmpConvoy();
    writeArtifacts(root, ['a.md', 'b.md']);
    const p = manifest(
      root,
      `reviewers:
  - name: complete
    model: opus
    verdict: APPROVE
    artifact: audit/a.md
  - name: missing-verdict
    model: fable
    artifact: audit/b.md
`,
    );
    assert.throws(() => parseCouncilManifest(p, root), /incomplete/);
  });

  it('throws when the manifest itself is absent', () => {
    const root = tmpConvoy();
    assert.throws(() => parseCouncilManifest(path.join(root, 'audit', 'nope.yaml'), root), /manifest not found/);
  });
});
