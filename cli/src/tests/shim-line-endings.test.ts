// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/shim-line-endings.test.ts
// description: conduit-install-experience-v1 AC-1 (D6) — the Windows batch
//              shim (conduit.cmd) must be generated with CRLF line endings.
//              cmd.exe mis-tokenizes LF-only batch files, producing a spurious
//              "'M' is not recognized" error on every invocation. The bash
//              shim must stay LF-only or Git Bash breaks the other way.
// owner:       BOTH
// update:      Manual when shim generation changes.
// schema:      none
// last_update: 2026-06-11
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeShimCmd, buildShimCmd, buildShimShell } from '../internal/bootstrap.js';

const ROOTS = [
  'C:\\Users\\dev\\Repos\\AcmeCorp\\Sandbox\\conduit', // native Windows
  'C:/Users/dev/Repos/AcmeCorp/Sandbox/conduit',       // forward-slash Windows
  '/Users/dev/Repos/AcmeCorp/Sandbox/conduit',         // POSIX
];

describe('shim line endings (AC-1 / D6)', () => {
  for (const root of ROOTS) {
    it(`conduit.cmd uses CRLF exclusively for root ${JSON.stringify(root)}`, () => {
      const cmd = buildShimCmd(root);
      assert.ok(cmd.includes('\r\n'), 'batch shim must contain CRLF line endings');
      assert.ok(!/[^\r]\n/.test(cmd) && !cmd.startsWith('\n'), 'batch shim must contain no bare LF — cmd.exe mis-tokenizes LF-only batch files');
      assert.ok(!cmd.includes('\r\r'), 'batch shim must not double-carriage-return');
    });

    it(`bash shim stays LF-only for root ${JSON.stringify(root)}`, () => {
      const shell = buildShimShell(root);
      assert.ok(!shell.includes('\r'), 'bash shim must not contain CR — Git Bash rejects CRLF shebang scripts');
    });
  }

  it('batch shim still carries the version marker and node entry', () => {
    const cmd = buildShimCmd('C:\\x\\conduit');
    assert.match(cmd, /conduit-shim-v\d+/);
    assert.ok(cmd.includes('C:\\x\\conduit\\dist\\cli\\src\\index.js'));
    assert.ok(cmd.includes('CONDUIT_NODE_ENTRY'));
  });

  it('analyzeShimCmd (doctor probe) classifies healthy and unhealthy shims', () => {
    const fresh = analyzeShimCmd(buildShimCmd('C:\\x\\conduit'));
    assert.deepEqual(fresh, { crlfOnly: true, currentVersion: true });

    const lfOnly = analyzeShimCmd(buildShimCmd('C:\\x\\conduit').replace(/\r\n/g, '\n'));
    assert.equal(lfOnly.crlfOnly, false);

    const stale = analyzeShimCmd(buildShimCmd('C:\\x\\conduit').replace(/conduit-shim-v\d+/, 'conduit-shim-v1'));
    assert.equal(stale.currentVersion, false);
  });
});
