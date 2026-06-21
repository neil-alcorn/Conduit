// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/registry-sync-drift.test.ts
// description: Defect 1c regression — verifies updateConvoyRegistryStage()
//              re-reads the full convoy.yaml and syncs ALL tracked fields,
//              not just `stage`. Source incident (2026-05-13): a convoy had
//              `work_item: "132997"` in convoy.yaml but registry.yaml
//              still showed `work_item: ''` because the field was set
//              after `convoy new` initialized the registry entry.
// owner:       BOTH
// update:      Manual when registry-sync contract changes.
// schema:      none
// last_update: 2026-05-13
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { updateConvoyRegistryStage } from '../commands/convoy.js';

interface ActiveEntry {
  id: string;
  title?: string;
  work_type?: string;
  stage?: number;
  status?: string;
  work_item?: string;
  created_date?: string;
  path?: string;
}

let workDir = '';

function setupRepo(convoyId: string, initialYaml: string, initialRegistry?: object): string {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-registry-drift-'));
  fs.mkdirSync(path.join(workDir, 'convoys', 'active', convoyId), { recursive: true });
  fs.writeFileSync(
    path.join(workDir, 'convoys', 'active', convoyId, 'convoy.yaml'),
    initialYaml,
    'utf-8',
  );
  const registry = initialRegistry ?? { convoys: { active: [] as ActiveEntry[], archived: [] } };
  fs.writeFileSync(
    path.join(workDir, 'convoys', 'registry.yaml'),
    yaml.dump(registry),
    'utf-8',
  );
  return workDir;
}

afterEach(() => {
  if (workDir && fs.existsSync(workDir)) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  workDir = '';
});

function readRegistry(): { convoys: { active: ActiveEntry[]; archived: unknown[] } } {
  const raw = fs.readFileSync(path.join(workDir, 'convoys', 'registry.yaml'), 'utf-8');
  return yaml.load(raw) as { convoys: { active: ActiveEntry[]; archived: unknown[] } };
}

describe('defect 1c — updateConvoyRegistryStage() syncs all convoy.yaml fields', () => {
  beforeEach(() => { workDir = ''; });

  it('reproduces the CNV-0001 drift: work_item added to convoy.yaml after registry init is now propagated', () => {
    // Initial state: registry has the convoy entry but with empty work_item
    // (the state CNV-0001 was in before the fix landed)
    const initialRegistry = {
      convoys: {
        active: [
          {
            id: 'test-drift-001',
            title: 'Test convoy',
            work_type: 'net-new',
            stage: 2,
            status: 'active',
            work_item: '',
            created_date: '2026-05-13',
            path: 'convoys/active/test-drift-001/',
          },
        ],
        archived: [],
      },
    };

    // convoy.yaml has the work_item filled in AND stage advanced to 3
    // (simulating: someone set work_item post-creation, then gate-2 was approved)
    const convoyYaml =
      `id: "test-drift-001"\n` +
      `title: "Test convoy"\n` +
      `work_type: "net-new"\n` +
      `stage: 3\n` +
      `status: active\n` +
      `work_item: "132997"\n` +
      `created_date: "2026-05-13"\n`;

    setupRepo('test-drift-001', convoyYaml, initialRegistry);

    // Simulate gate approve calling updateConvoyRegistryStage()
    updateConvoyRegistryStage(workDir, 'test-drift-001', 3);

    const registry = readRegistry();
    const entry = registry.convoys.active.find(e => e.id === 'test-drift-001');
    assert.ok(entry, 'convoy entry should be present in registry');
    assert.equal(entry.stage, 3, 'stage must reflect new stage from convoy.yaml');
    assert.equal(entry.work_item, '132997', 'work_item must propagate from convoy.yaml — this is the defect-1c fix');
    assert.equal(entry.title, 'Test convoy');
    assert.equal(entry.work_type, 'net-new');
  });

  it('updates the entry even if other unrelated convoy.yaml fields changed (title, status)', () => {
    const initialRegistry = {
      convoys: {
        active: [
          {
            id: 'test-drift-002',
            title: 'Old title',
            work_type: 'enhancement',
            stage: 1,
            status: 'active',
            work_item: '',
            created_date: '2026-05-13',
            path: 'convoys/active/test-drift-002/',
          },
        ],
        archived: [],
      },
    };

    const convoyYaml =
      `id: "test-drift-002"\n` +
      `title: "New title after edit"\n` +
      `work_type: "enhancement"\n` +
      `stage: 2\n` +
      `status: paused\n` +
      `work_item: "999999"\n`;

    setupRepo('test-drift-002', convoyYaml, initialRegistry);
    updateConvoyRegistryStage(workDir, 'test-drift-002', 2);

    const registry = readRegistry();
    const entry = registry.convoys.active.find(e => e.id === 'test-drift-002');
    assert.ok(entry);
    assert.equal(entry.title, 'New title after edit');
    assert.equal(entry.status, 'paused');
    assert.equal(entry.work_item, '999999');
    assert.equal(entry.stage, 2);
  });

  it('no-ops gracefully if registry.yaml is missing (warns, does not throw)', () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-registry-drift-'));
    fs.mkdirSync(path.join(workDir, 'convoys', 'active', 'test-drift-003'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'convoys', 'active', 'test-drift-003', 'convoy.yaml'),
      `id: "test-drift-003"\nstage: 1\nstatus: active\n`,
      'utf-8',
    );

    // No registry.yaml exists — should warn and return, not throw
    const origWarn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    try {
      assert.doesNotThrow(() => updateConvoyRegistryStage(workDir, 'test-drift-003', 1));
      assert.equal(warned, true, 'should have warned about missing registry.yaml');
    } finally {
      console.warn = origWarn;
    }
  });

  it('preserves other entries in the active list (only mutates the named convoy)', () => {
    const initialRegistry = {
      convoys: {
        active: [
          { id: 'other-a', title: 'Other A', stage: 1, status: 'active', work_item: 'AAA', path: 'convoys/active/other-a/' },
          { id: 'test-drift-004', title: 'Drift target', stage: 2, status: 'active', work_item: '', path: 'convoys/active/test-drift-004/' },
          { id: 'other-b', title: 'Other B', stage: 3, status: 'active', work_item: 'BBB', path: 'convoys/active/other-b/' },
        ],
        archived: [],
      },
    };

    const convoyYaml =
      `id: "test-drift-004"\n` +
      `title: "Drift target"\n` +
      `work_type: "net-new"\n` +
      `stage: 3\n` +
      `status: active\n` +
      `work_item: "777777"\n`;

    setupRepo('test-drift-004', convoyYaml, initialRegistry);
    updateConvoyRegistryStage(workDir, 'test-drift-004', 3);

    const registry = readRegistry();
    const ids = registry.convoys.active.map(e => e.id);
    assert.deepEqual([...ids].sort(), ['other-a', 'other-b', 'test-drift-004']);

    const a = registry.convoys.active.find(e => e.id === 'other-a');
    const b = registry.convoys.active.find(e => e.id === 'other-b');
    assert.equal(a?.work_item, 'AAA', 'other-a should be untouched');
    assert.equal(b?.work_item, 'BBB', 'other-b should be untouched');

    const target = registry.convoys.active.find(e => e.id === 'test-drift-004');
    assert.equal(target?.work_item, '777777');
    assert.equal(target?.stage, 3);
  });
});
