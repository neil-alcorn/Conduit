// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/signals.test.ts
// description: Unit tests for Repo Signal markdown parsing and fail-closed behavior.
// owner:       BOTH
// update:      Manual when Repo Signal parsing or validation behavior changes.
// schema:      highways/repo-signals.schema.yaml
// last_update: 2026-04-07
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractRepoSignalBlock, parseSignalsFromFile, checkPermission } from '../internal/signals.js';

function writeConduitMarkdown(dir: string, status: string, systemClass: string): string {
  const content = `## Repo Signals\n\`\`\`yaml\noperational_status: ${status}\nsystem_class: ${systemClass}\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;
  const repoPath = fs.mkdtempSync(path.join(dir, 'conduit-test-'));
  fs.writeFileSync(path.join(repoPath, 'CONDUIT.md'), content, 'utf-8');
  return repoPath;
}

describe('extractRepoSignalBlock', () => {
  it('extracts yaml block from valid content', () => {
    const content = '## Repo Signals\n```yaml\noperational_status: ACTIVE\nsystem_class: MODERN\n```\n';
    const block = extractRepoSignalBlock(content);
    assert.equal(block, 'operational_status: ACTIVE\nsystem_class: MODERN');
  });

  it('throws on missing heading', () => {
    assert.throws(() => extractRepoSignalBlock('```yaml\noperational_status: ACTIVE\n```'), /missing ## Repo Signals heading/);
  });

  it('throws on missing yaml fence', () => {
    assert.throws(() => extractRepoSignalBlock('## Repo Signals\noperational_status: ACTIVE\n'), /missing `{3}yaml fence/);
  });
});

describe('parseSignalsFromFile', () => {
  const tmp = os.tmpdir();

  it('throws on malformed YAML', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'conduit-test-'));
    const p = path.join(dir, 'CONDUIT.md');
    fs.writeFileSync(p, '## Repo Signals\n```yaml\noperational_status: [ACTIVE\n```\n', 'utf-8');
    assert.throws(() => parseSignalsFromFile(p));
  });
});

describe('checkPermission', () => {
  const tmp = os.tmpdir();

  it('fails closed when CONDUIT.md is missing', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'conduit-test-'));
    assert.throws(() => checkPermission(dir, 'write'), /failing closed/);
  });

  it('blocks QUARANTINE for any intent', () => {
    const repoPath = writeConduitMarkdown(tmp, 'QUARANTINE', 'MODERN');
    assert.throws(() => checkPermission(repoPath, 'write'), /QUARANTINE/);
  });

  it('blocks READ-ONLY for write intent', () => {
    const repoPath = writeConduitMarkdown(tmp, 'READ-ONLY', 'MODERN');
    assert.throws(() => checkPermission(repoPath, 'write'), /READ-ONLY/);
  });

  it('allows READ-ONLY for read intent', () => {
    const repoPath = writeConduitMarkdown(tmp, 'READ-ONLY', 'MODERN');
    assert.doesNotThrow(() => checkPermission(repoPath, 'read'));
  });

  it('blocks MAINFRAME for execute intent', () => {
    const repoPath = writeConduitMarkdown(tmp, 'ACTIVE', 'MAINFRAME');
    assert.throws(() => checkPermission(repoPath, 'execute'), /MAINFRAME/);
  });

  it('allows ACTIVE MODERN for write intent', () => {
    const repoPath = writeConduitMarkdown(tmp, 'ACTIVE', 'MODERN');
    assert.doesNotThrow(() => checkPermission(repoPath, 'write'));
  });
});
