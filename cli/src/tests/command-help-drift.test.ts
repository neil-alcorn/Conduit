// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/command-help-drift.test.ts
// description: conduit-install-experience-v1 AC-2 (D5) — the COMMAND_HELP
//              usage map in cli/src/index.ts must not drift from the real
//              command parsers. D5: `conduit learn` advertised `--file` while
//              the parser required `--name`/`--content-file`, costing a new
//              user multiple failed attempts. Source-level guard: every flag
//              a command throws "is required" for must appear in its usage
//              line, and the usage line must not advertise unknown flags.
// owner:       BOTH
// update:      Manual when COMMAND_HELP or command parsers change shape.
// schema:      none
// last_update: 2026-06-11
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

// dist/cli/src/tests → repo root is four levels up
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const INDEX_SRC = fs.readFileSync(path.join(REPO_ROOT, 'cli', 'src', 'index.ts'), 'utf-8');
const LEARN_SRC = fs.readFileSync(path.join(REPO_ROOT, 'cli', 'src', 'commands', 'learn.ts'), 'utf-8');

function commandHelpLine(command: string): string {
  const m = INDEX_SRC.match(new RegExp(`'${command}':\\s*'([^']+)'`));
  assert.ok(m, `COMMAND_HELP must contain an entry for '${command}'`);
  return m![1];
}

describe('COMMAND_HELP drift guard (AC-2 / D5)', () => {
  it('learn usage advertises every flag the parser requires', () => {
    const usage = commandHelpLine('learn');
    // Flags learn.ts hard-fails without: `throw new Error('conduit learn: --X is required')`
    const required = [...LEARN_SRC.matchAll(/conduit learn: (--[a-z-]+) is required/g)].map(m => m[1]);
    assert.ok(required.length >= 2, 'expected learn.ts to declare required flags via "is required" errors');
    for (const flag of required) {
      assert.ok(usage.includes(flag), `usage line must mention required flag ${flag} — got: ${usage}`);
    }
  });

  it('learn usage advertises only flags the parser actually reads', () => {
    const usage = commandHelpLine('learn');
    const parsed = new Set([...LEARN_SRC.matchAll(/parseFlagValue\([^,]+,\s*'(--[a-z-]+)'\)/g)].map(m => m[1]));
    const advertised = [...usage.matchAll(/--[a-z-]+/g)].map(m => m[0]);
    for (const flag of advertised) {
      assert.ok(parsed.has(flag), `usage advertises ${flag} but learn.ts never parses it — got: ${usage}`);
    }
  });

  it('learn usage line matches the usage printed by learn.ts itself', () => {
    const usage = commandHelpLine('learn');
    const inline = LEARN_SRC.match(/usage: (conduit learn [^']+)'/);
    assert.ok(inline, 'learn.ts must print a usage line');
    const flagsOf = (s: string) => [...s.matchAll(/--[a-z-]+/g)].map(m => m[0]).sort().join(',');
    assert.equal(flagsOf(usage), flagsOf(inline![1]), 'COMMAND_HELP and learn.ts usage must advertise the same flag set');
  });
});
