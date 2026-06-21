// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/convoy-new-guard.test.ts
// description: Tests for convoy new — writeRegistry guard (post-CLI-4) and
//              the provider-neutral optional work-item flag. Replaces the old
//              Phase-0 ADO governance tests now that work items are optional.
// owner:       BOTH
// update:      Manual when writeRegistry guard or work-item contract changes.
// schema:      none
// last_update: 2026-06-18
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { runConvoy } from '../commands/convoy.js';
import { ConduitNotInitializedError } from '../utils.js';
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

function makeNonConduitDir(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cn-guard-${label}-`));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  return dir;
}

function makeConduitShapedDir(label: string): string {
  const dir = makeNonConduitDir(label);
  fs.mkdirSync(path.join(dir, 'convoys', 'active'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'convoys', 'registry.yaml'),
    'convoys:\n  active: []\n  archived: []\n', 'utf-8');
  return dir;
}

describe('convoy new — writeRegistry guard (post-CLI-4 follow-up)', () => {
  it('refuses to bootstrap convoys/ in a non-conduit-shaped directory', async () => {
    const s = snap();
    const dir = makeNonConduitDir('refuse');
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-cfg-'));
    process.env.CONDUIT_CONFIG_PATH = path.join(cfgDir, 'missing.json');
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    clearConfigCache();
    try {
      await assert.rejects(
        () => runConvoy(['new',
          '--title', 'guard-test',
          '--description', 'should be refused before any mkdir',
          '--repo', dir,
        ]),
        (err: Error) => err instanceof ConduitNotInitializedError &&
          /refusing to bootstrap convoys\//.test(err.message),
      );
      // Critical: the guard must fire BEFORE any mkdir. No convoys/ should exist.
      assert.equal(fs.existsSync(path.join(dir, 'convoys')), false,
        'convoys/ was created despite the guard — that defeats the purpose');
    } finally {
      restore(s);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
      try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  it('CONDUIT_LEGACY_RESOLVE=1 bypasses the guard for the escape-hatch window', async () => {
    const s = snap();
    // Legacy-mode users typically have an existing convoys/registry.yaml (created
    // pre-CLI-4 by the old auto-create path). We seed one so the bypass test
    // reaches the actual guard call without hitting an unrelated downstream
    // ENOENT on the legacy registry-update step. The assertion is narrow:
    // the assertConduitRepo throw must NOT fire.
    const dir = makeConduitShapedDir('bypass');
    process.env.CONDUIT_LEGACY_RESOLVE = '1';
    delete process.env.CONDUIT_HOME;
    clearConfigCache();
    try {
      let threw: Error | null = null;
      try {
        await runConvoy(['new',
          '--title', 'legacy-bypass',
          '--description', 'guard skipped under CONDUIT_LEGACY_RESOLVE=1',
          '--repo', dir,
        ]);
      } catch (err) {
        threw = err as Error;
      }
      assert.equal(threw instanceof ConduitNotInitializedError, false,
        `assertConduitRepo fired despite CONDUIT_LEGACY_RESOLVE=1${threw ? `; threw ${threw.message}` : ''}`);
    } finally {
      restore(s);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  it('proceeds normally when the resolved root is already conduit-shaped', async () => {
    const s = snap();
    const dir = makeConduitShapedDir('ok');
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    clearConfigCache();
    try {
      await runConvoy(['new',
        '--title', 'normal-flow',
        '--description', 'conduit-shaped dir → guard returns silently',
        '--repo', dir,
      ]);
      // A new convoy directory should exist under convoys/active/.
      const activeDirs = fs.readdirSync(path.join(dir, 'convoys', 'active'))
        .filter(n => !n.startsWith('.'));
      assert.ok(activeDirs.length >= 1, 'expected at least one convoy directory under convoys/active/');
    } finally {
      restore(s);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});

describe('convoy new — optional provider-neutral work item', () => {
  it('Test A: succeeds with no work item and writes a convoy.yaml', async () => {
    const s = snap();
    const dir = makeConduitShapedDir('no-wi');
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    clearConfigCache();
    try {
      // Must NOT throw — work item is optional in the personal version
      await runConvoy(['new',
        '--title', 'no-work-item-convoy',
        '--description', 'created without any work item ref',
        '--id', 'no-wi-convoy',
        '--repo', dir,
      ]);
      const yamlPath = path.join(dir, 'convoys', 'active', 'no-wi-convoy', 'convoy.yaml');
      assert.ok(fs.existsSync(yamlPath), 'convoy.yaml was not created');
      const body = fs.readFileSync(yamlPath, 'utf-8');
      assert.ok(body.includes('no-wi-convoy'), 'convoy.yaml does not contain the convoy id');
      // work_item key must NOT appear when none was supplied
      assert.ok(!body.includes('work_item:'), 'work_item key should be absent when not supplied');
    } finally {
      restore(s);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  it('Test B: --work-item GH-42 writes work_item: GH-42 into convoy.yaml', async () => {
    const s = snap();
    const dir = makeConduitShapedDir('wi-ref');
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    clearConfigCache();
    try {
      await runConvoy(['new',
        '--title', 'with-work-item',
        '--description', 'convoy with a provider-neutral work item ref',
        '--id', 'wi-ref-convoy',
        '--work-item', 'GH-42',
        '--repo', dir,
      ]);
      const yamlPath = path.join(dir, 'convoys', 'active', 'wi-ref-convoy', 'convoy.yaml');
      assert.ok(fs.existsSync(yamlPath), 'convoy.yaml was not created');
      // Parse the YAML portion (skip the comment header lines)
      const rawBody = fs.readFileSync(yamlPath, 'utf-8');
      // Strip leading comment lines so js-yaml can parse cleanly
      const yamlOnly = rawBody.split('\n').filter(l => !l.startsWith('#')).join('\n');
      // There are multiple YAML docs joined; parse the first one
      const docs = yaml.loadAll(yamlOnly) as Array<Record<string, unknown>>;
      const topDoc = docs.find(d => d && typeof d === 'object' && 'id' in d) as Record<string, unknown>;
      assert.ok(topDoc, 'could not find main convoy document in convoy.yaml');
      assert.equal(topDoc['work_item'], 'GH-42',
        `expected work_item: 'GH-42' but got: ${JSON.stringify(topDoc['work_item'])}`);
      // Old work-tracker-specific fields must be gone
      assert.ok(!('work_item_deferred' in topDoc), 'work_item_deferred should be absent in personal version');
    } finally {
      restore(s);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});
