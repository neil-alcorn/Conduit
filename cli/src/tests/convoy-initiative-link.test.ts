// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/convoy-initiative-link.test.ts
// description: Tests for convoy new -- optional --initiative <id> flag that
//              writes initiative_id into the generated convoy.yaml.
// owner:       BOTH
// update:      Manual when initiative-link contract changes.
// schema:      none
// last_update: 2026-06-19
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { runConvoy } from '../commands/convoy.js';
import { clearConfigCache } from '../internal/conduit-config.js';

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

interface EnvSnap {
  CONDUIT_HOME?: string;
  CONDUIT_LEGACY_RESOLVE?: string;
  CONDUIT_CONFIG_PATH?: string;
}

function snap(): EnvSnap {
  return {
    CONDUIT_HOME: process.env.CONDUIT_HOME,
    CONDUIT_LEGACY_RESOLVE: process.env.CONDUIT_LEGACY_RESOLVE,
    CONDUIT_CONFIG_PATH: process.env.CONDUIT_CONFIG_PATH,
  };
}

function restore(s: EnvSnap): void {
  for (const k of Object.keys(s) as (keyof EnvSnap)[]) {
    if (s[k] === undefined) delete process.env[k];
    else process.env[k] = s[k]!;
  }
  clearConfigCache();
}

function makeConduitShapedDir(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cn-init-${label}-`));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  fs.mkdirSync(path.join(dir, 'convoys', 'active'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'convoys', 'registry.yaml'),
    'convoys:\n  active: []\n  archived: []\n', 'utf-8');
  return dir;
}

describe('convoy new — optional --initiative flag', () => {
  it('Test A: --initiative ship-mvp writes initiative_id: ship-mvp into convoy.yaml', async () => {
    const s = snap();
    const dir = makeConduitShapedDir('with-init');
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    clearConfigCache();
    try {
      await runConvoy([
        'new',
        '--title', 'Linked',
        '--description', 'd',
        '--work-type', 'net-new',
        '--initiative', 'ship-mvp',
        '--id', 'linked-convoy',
        '--repo', dir,
      ]);
      const yamlPath = path.join(dir, 'convoys', 'active', 'linked-convoy', 'convoy.yaml');
      assert.ok(fs.existsSync(yamlPath), 'convoy.yaml was not created');
      const rawBody = fs.readFileSync(yamlPath, 'utf-8');
      // Strip leading comment lines so js-yaml can parse cleanly
      const yamlOnly = rawBody.split('\n').filter(l => !l.startsWith('#')).join('\n');
      const docs = yaml.loadAll(yamlOnly) as Array<Record<string, unknown>>;
      const topDoc = docs.find(d => d && typeof d === 'object' && 'id' in d) as Record<string, unknown>;
      assert.ok(topDoc, 'could not find main convoy document in convoy.yaml');
      assert.equal(
        topDoc['initiative_id'],
        'ship-mvp',
        `expected initiative_id: 'ship-mvp' but got: ${JSON.stringify(topDoc['initiative_id'])}`,
      );
    } finally {
      restore(s);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  it('Test B: without --initiative, initiative_id is absent from convoy.yaml', async () => {
    const s = snap();
    const dir = makeConduitShapedDir('no-init');
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    clearConfigCache();
    try {
      await runConvoy([
        'new',
        '--title', 'Unlinked',
        '--description', 'no initiative link',
        '--work-type', 'net-new',
        '--id', 'unlinked-convoy',
        '--repo', dir,
      ]);
      const yamlPath = path.join(dir, 'convoys', 'active', 'unlinked-convoy', 'convoy.yaml');
      assert.ok(fs.existsSync(yamlPath), 'convoy.yaml was not created');
      const rawBody = fs.readFileSync(yamlPath, 'utf-8');
      const yamlOnly = rawBody.split('\n').filter(l => !l.startsWith('#')).join('\n');
      const docs = yaml.loadAll(yamlOnly) as Array<Record<string, unknown>>;
      const topDoc = docs.find(d => d && typeof d === 'object' && 'id' in d) as Record<string, unknown>;
      assert.ok(topDoc, 'could not find main convoy document in convoy.yaml');
      assert.ok(
        !('initiative_id' in topDoc),
        `initiative_id should be absent when --initiative is not supplied, but found: ${JSON.stringify(topDoc['initiative_id'])}`,
      );
    } finally {
      restore(s);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});
