// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/yaml-injection.test.ts
// description: AC-19 regression (review BUG-3) — user-supplied values written
//              to convoy.yaml (title, gate name, withdrawal reason) must be
//              produced by parse-modify-serialize, never string templating.
//              A payload containing newlines / YAML syntax ("x\nstage: 8")
//              must NOT alter `stage:` (or any other field) as read back by
//              the state guards — neither via js-yaml parse nor via the
//              first-match `/^stage:/m` regex readers gate.ts uses.
// owner:       BOTH
// update:      Manual when convoy.yaml write-path hardening changes.
// schema:      none
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { runConvoy } from '../commands/convoy.js';
import { runGate } from '../commands/gate.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';
import { clearConfigCache } from '../internal/conduit-config.js';

const ACTIVE_CONDUIT_MD = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: 2026-04-07\n\`\`\`\n`;

function tmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), ACTIVE_CONDUIT_MD, 'utf-8');
  fs.mkdirSync(path.join(dir, 'convoys', 'active'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'convoys', 'registry.yaml'),
    'convoys:\n  active: []\n  archived: []\n',
    'utf-8',
  );
  return dir;
}

function makeConvoy(repoDir: string, convoyId: string, stage: number, extraLines = ''): string {
  const convoyDir = path.join(repoDir, 'convoys', 'active', convoyId);
  fs.mkdirSync(convoyDir, { recursive: true });
  const yamlContent = `id: "${convoyId}"\nstage: ${stage}\nstatus: active\n${extraLines}`;
  fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'), yamlContent, 'utf-8');
  return convoyDir;
}

/** Mirror of gate.ts readStage — the regex state guard the attack targets. */
function regexStage(content: string): number {
  const match = content.match(/^stage:\s*(\d+)/m);
  return match ? parseInt(match[1], 10) : -1;
}

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

describe('AC-19 — YAML injection via user input cannot spoof convoy.yaml state', () => {
  it('convoy new: a title containing "\\nstage: 8" cannot alter the stage read back', async () => {
    const s = snap();
    const dir = tmpDir('conduit-yinj-new-');
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-yinj-cfg-'));
    process.env.CONDUIT_CONFIG_PATH = path.join(cfgDir, 'missing.json');
    delete process.env.CONDUIT_HOME;
    delete process.env.CONDUIT_LEGACY_RESOLVE;
    clearConfigCache();
    const payload = 'Quarterly summary\nstage: 8\ninjected_marker: true';
    try {
      await runConvoy(['new',
        '--title', payload,
        '--description', 'yaml injection regression fixture',
        '--repo', dir,
      ]);

      const activeDirs = fs.readdirSync(path.join(dir, 'convoys', 'active'))
        .filter(n => !n.startsWith('.'));
      assert.equal(activeDirs.length, 1, 'exactly one convoy should be created');
      const content = fs.readFileSync(
        path.join(dir, 'convoys', 'active', activeDirs[0], 'convoy.yaml'), 'utf-8');

      // Regex state guard (gate.ts readStage shape) must see the REAL stage.
      assert.equal(regexStage(content), 0,
        `stage spoofed via title injection; convoy.yaml:\n${content}`);

      // Parsed view: stage intact, payload safely contained in title as a string.
      const doc = yaml.load(content) as Record<string, unknown>;
      assert.equal(doc['stage'], 0, 'parsed stage must be the original 0');
      assert.equal(doc['title'], payload,
        'title must round-trip exactly (payload contained as a plain string)');
      assert.equal(doc['injected_marker'], undefined,
        'payload must not create top-level keys');
    } finally {
      restore(s);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
      try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('gate approve: a gate name containing "\\nstage: 9" is contained in gate_history, stage increments normally', async () => {
    const dir = tmpDir('conduit-yinj-gate-');
    const convoyDir = makeConvoy(dir, 'cnv-yinj-g', 2, 'gate_history: []\n');
    const payload = 'gate-x\nstage: 9\ninjected_marker: true';
    appendConvoyEvent(
      { ts: new Date().toISOString(), type: 'gate_requested', convoy: 'cnv-yinj-g', gate: payload, stage: 2, approver: 'test' },
      convoyDir,
    );

    await runGate(['approve', 'cnv-yinj-g', payload, '--repo', dir]);

    const content = fs.readFileSync(path.join(convoyDir, 'convoy.yaml'), 'utf-8');

    // Regex state guard must see the legitimately-incremented stage (3), not 9.
    assert.equal(regexStage(content), 3,
      `stage spoofed via gate-name injection; convoy.yaml:\n${content}`);

    // The file must parse cleanly and contain the payload as a plain string.
    const doc = yaml.load(content) as Record<string, unknown>;
    assert.equal(doc['stage'], 3, 'parsed stage must be 3 after approve from 2');
    assert.equal(doc['injected_marker'], undefined, 'payload must not create top-level keys');
    const history = doc['gate_history'] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(history) && history.length === 1, 'one gate_history entry expected');
    assert.equal(history[0]['gate'], payload,
      'gate name must round-trip exactly (payload contained as a plain string)');
    assert.equal(history[0]['decision'], 'approve');
  });

  it('convoy close --withdrawn: a reason containing "\\nstage: 8\\nstatus: released" is contained as a string', async () => {
    const dir = tmpDir('conduit-yinj-close-');
    makeConvoy(dir, 'cnv-yinj-c', 4);
    const payload = 'stakeholder withdrew funding\nstage: 8\nstatus: released\ninjected_marker: true';

    await runConvoy(['close', 'cnv-yinj-c', '--withdrawn', '--reason', payload, '--repo', dir]);

    const archivedPath = path.join(dir, 'convoys', 'archive', 'cnv-yinj-c', 'convoy.yaml');
    const content = fs.readFileSync(archivedPath, 'utf-8');

    // Regex state guards must see the real values.
    assert.equal(regexStage(content), 4,
      `stage spoofed via reason injection; convoy.yaml:\n${content}`);
    const statusMatch = content.match(/^status:\s*(\S+)/m);
    assert.equal(statusMatch?.[1], 'withdrawn', 'regex-read status must be withdrawn');

    // Parsed view: payload contained exactly in withdrawn_reason.
    const doc = yaml.load(content) as Record<string, unknown>;
    assert.equal(doc['stage'], 4, 'parsed stage must remain 4');
    assert.equal(doc['status'], 'withdrawn', 'parsed status must be withdrawn');
    assert.equal(doc['withdrawn_reason'], payload,
      'withdrawn_reason must round-trip exactly (payload contained as a plain string)');
    assert.equal(doc['injected_marker'], undefined, 'payload must not create top-level keys');
  });

  it('rewrites preserve the CONDUIT MANAGED FILE header comment block', async () => {
    const dir = tmpDir('conduit-yinj-hdr-');
    const convoyDir = path.join(dir, 'convoys', 'active', 'cnv-yinj-h');
    fs.mkdirSync(convoyDir, { recursive: true });
    const header =
      `# ── CONDUIT MANAGED FILE ────────────────────────────────────────────\n` +
      `# file:        convoys/active/cnv-yinj-h/convoy.yaml\n` +
      `# last_update: 2026-06-01\n` +
      `# ─────────────────────────────────────────────────────────────────────\n`;
    fs.writeFileSync(path.join(convoyDir, 'convoy.yaml'),
      header + `id: "cnv-yinj-h"\nstage: 1\nstatus: active\ngate_history: []\n`, 'utf-8');
    appendConvoyEvent(
      { ts: new Date().toISOString(), type: 'gate_requested', convoy: 'cnv-yinj-h', gate: 'gate-1', stage: 1, approver: 'test' },
      convoyDir,
    );

    await runGate(['approve', 'cnv-yinj-h', 'gate-1', '--repo', dir]);

    const content = fs.readFileSync(path.join(convoyDir, 'convoy.yaml'), 'utf-8');
    assert.ok(content.startsWith('# ── CONDUIT MANAGED FILE'),
      'managed-file header must survive the rewrite');
    assert.match(content, /^# file: {8}convoys\/active\/cnv-yinj-h\/convoy\.yaml$/m,
      'header body lines must survive the rewrite');
    assert.equal(regexStage(content), 2, 'stage must increment to 2');
  });
});
