// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/hermetic-env.test.ts
// description: Regression guard. setup-env.ts marks the test process and is
//              wired into the root package.json test script via --import. If
//              that wiring regresses, this file fails the build.
// owner:       BOTH
// update:      Manual when the test-run guard changes.
// schema:      none
// last_update: 2026-06-20
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

// Compiled location: dist/cli/src/tests → repo root is four levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('hermetic test environment', () => {
  it('the test process is marked as a test run', () => {
    assert.equal(process.env.CONDUIT_TEST, '1', 'CONDUIT_TEST=1 must be set by setup-env');
  });

  it('root package.json test script keeps setup-env wired via --import', () => {
    // The guard only works if the runner actually loads it. Guard the wiring
    // so a "simplified" test script cannot silently drop setup-env.
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const testScript: string = pkg.scripts?.test ?? '';
    assert.match(
      testScript,
      /--import \.\/dist\/cli\/src\/tests\/setup-env\.js/,
      'package.json "test" script must load setup-env.js via --import before the test runner',
    );
  });
});
