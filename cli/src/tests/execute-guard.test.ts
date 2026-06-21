// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/execute-guard.test.ts
// description: Tests for C11 (double start). Validates that running
//              execute start twice throws about already executing.
// owner:       BOTH
// update:      Manual when execute start guard logic changes.
// schema:      none
// last_update: 2026-04-20
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runExecute } from '../commands/execute.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-exec-guard-'));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

function makeConvoyWithPlan(repoDir: string, convoyId: string): string {
  const convoyDir = path.join(repoDir, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  const yamlContent = `id: "${convoyId}"\nstage: 3\nstatus: active\n`;
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'), yamlContent, 'utf-8');

  // Create an approved plan with a task table
  const planContent = `# Plan for ${convoyId}

## Plan ID: PLN-001
## Status: approved

| ID | Title | Repo | Depends | Priority | Wave | Status |
|----|-------|------|---------|----------|------|--------|
| T-001 | Build widget | conduit | none | P1 | 1 | pending |
| T-002 | Test widget | conduit | T-001 | P2 | 2 | pending |
`;
  fs.writeFileSync(path.join(convoyDir, 'plan.md'), planContent, 'utf-8');
  return convoyDir;
}

describe('execute start — C11 double start guard', () => {
  it('succeeds on first execute start', async () => {
    const dir = tmpDir();
    const convoyDir = makeConvoyWithPlan(dir, 'cnv-exec-1');
    await runExecute(['start', 'cnv-exec-1', '--repo', dir]);
    const manifestPath = path.join(convoyDir, 'execution-manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'execution-manifest.json should be created');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifest.status, 'executing');
  });

  it('throws when execute start is called twice', async () => {
    const dir = tmpDir();
    makeConvoyWithPlan(dir, 'cnv-exec-2');
    // First start — should succeed
    await runExecute(['start', 'cnv-exec-2', '--repo', dir]);
    // Second start — should throw
    await assert.rejects(
      () => runExecute(['start', 'cnv-exec-2', '--repo', dir]),
      /already running|already executing/i
    );
  });
});
