// CONDUIT MANAGED FILE
// file:        cli/src/tests/init-enrich.test.ts
// description: Regression coverage for `conduit init --enrich` protocol output
//              and verification handoff.
// owner:       BOTH
// update:      Manual when repo enrichment behavior changes.
// schema:      none
// last_update: 2026-06-11

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInit } from '../commands/init.js';

const CONDUIT_MD = `## Repo Signals
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
last_context_update: 2020-01-01
\`\`\`
`;

const SKELETON_CONTEXT = `# CONTEXT: sample

## Architecture Overview

TODO: fill in.

## Module or Service Map

TODO: fill in.

## Data Flow Summary

TODO: fill in.

## Authentication and Authorization

TODO: fill in.

## Significant Changes (Last 90 Days)

TODO: fill in.

## Technical Debt Relevant to Routing

TODO: fill in.

## Performance Characteristics

TODO: fill in.

## Known Failure Modes

TODO: fill in.
`;

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-init-enrich-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.conduit'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), CONDUIT_MD, 'utf-8');
  fs.writeFileSync(path.join(dir, 'CONTEXT.md'), SKELETON_CONTEXT, 'utf-8');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"sample","scripts":{"test":"node --test"}}\n', 'utf-8');
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const ok = true;\n', 'utf-8');
  fs.writeFileSync(path.join(dir, '.conduit', 'config.yaml'), 'service: {}\n', 'utf-8');
  return dir;
}

function enrichedContext(): string {
  return `# CONTEXT: sample

## Architecture Overview

The repo is a TypeScript CLI. Evidence anchors: \`package.json\`, \`src/index.ts\`.

## Module or Service Map

| Module | Path | Description | Evidence |
|--------|------|-------------|----------|
| CLI entry | \`src/index.ts\` | Exports the command entry point used by package scripts. | \`src/index.ts\` |

## Data Flow Summary

Configuration is read from repo-local files and command flags before output is emitted.
Evidence anchors: \`package.json\`, \`.conduit/config.yaml\`.

## Authentication and Authorization

No app authentication boundary is present in this fixture. Service credentials would come
from environment or \`.conduit/config.yaml\`.

## Significant Changes (Last 90 Days)

Recent changes are inspected with git history during real enrichment. This fixture records
the expected section shape without calling git.

## Technical Debt Relevant to Routing

Route decisions depend on the CLI entry surface in \`src/index.ts\` and package scripts in
\`package.json\`.

## Performance Characteristics

The command surface performs local file reads and bounded validation checks.

## Known Failure Modes

| Failure | Evidence | Mitigation |
|---------|----------|------------|
| Missing local config | \`.conduit/config.yaml\` | Recreate config or pass explicit environment values. |
`;
}

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  return {
    lines,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
  };
}

describe('init --enrich', () => {
  it('prints the host-neutral enrichment protocol without mutating CONTEXT.md', async () => {
    const dir = tmpRepo();
    const before = fs.readFileSync(path.join(dir, 'CONTEXT.md'), 'utf-8');
    const cap = captureConsole();
    try {
      await runInit([dir, '--enrich']);
    } finally {
      cap.restore();
    }

    const output = cap.lines.join('\n');
    assert.match(output, /CONDUIT REPO ENRICHMENT PROTOCOL/);
    assert.match(output, /Module or Service Map/);
    assert.match(output, /git log/);
    assert.match(output, /grep/i);
    assert.equal(fs.readFileSync(path.join(dir, 'CONTEXT.md'), 'utf-8'), before);
    assert.equal(fs.existsSync(path.join(dir, '.conduit', 'enrichment-log.jsonl')), false);
  });

  it('refuses verification when required sections still contain TODO placeholders', async () => {
    const dir = tmpRepo();
    await assert.rejects(
      () => runInit([dir, '--enrich', '--verify']),
      /CONTEXT\.md enrichment verification failed|TODO/i,
    );
    assert.equal(fs.existsSync(path.join(dir, '.conduit', 'enrichment-log.jsonl')), false);
  });

  it('verifies enriched CONTEXT.md, appends an enrichment log, and refreshes last_context_update', async () => {
    const dir = tmpRepo();
    fs.writeFileSync(path.join(dir, 'CONTEXT.md'), enrichedContext(), 'utf-8');

    await runInit([dir, '--enrich', '--verify']);

    const logPath = path.join(dir, '.conduit', 'enrichment-log.jsonl');
    assert.ok(fs.existsSync(logPath), 'enrichment log should be written');
    const entries = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.equal(entries.length, 1);
    const entry = JSON.parse(entries[0]) as Record<string, unknown>;
    assert.equal(entry['repo'], path.basename(dir));
    assert.equal(entry['verified'], true);
    // AC-15: log must carry ts, actor, sections, evidence_anchors
    assert.ok(typeof entry['ts'] === 'string' && (entry['ts'] as string).length > 0, 'ts should be a non-empty string');
    assert.ok(typeof entry['actor'] === 'string', 'actor field should be present');
    assert.ok(Array.isArray(entry['sections']) && (entry['sections'] as unknown[]).length > 0, 'sections should be a non-empty array');
    assert.ok(Array.isArray(entry['evidence_anchors']), 'evidence_anchors should be an array');

    const conduitMd = fs.readFileSync(path.join(dir, 'CONDUIT.md'), 'utf-8');
    const today = new Date().toISOString().slice(0, 10);
    assert.match(conduitMd, new RegExp(`last_context_update:\\s*"?${today}"?`));
  });

  // AC-13: missing preconditions must fail with a clear message before writing anything
  it('fails with clear message when CONDUIT.md is missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-init-enrich-nocd-'));
    fs.mkdirSync(path.join(dir, '.conduit'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'CONTEXT.md'), SKELETON_CONTEXT, 'utf-8');
    await assert.rejects(
      () => runInit([dir, '--enrich']),
      /CONDUIT\.md not found/i,
    );
  });

  it('fails with clear message when CONTEXT.md is missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-init-enrich-noctx-'));
    fs.mkdirSync(path.join(dir, '.conduit'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'CONDUIT.md'), CONDUIT_MD, 'utf-8');
    await assert.rejects(
      () => runInit([dir, '--enrich']),
      /CONTEXT\.md not found/i,
    );
  });
});
