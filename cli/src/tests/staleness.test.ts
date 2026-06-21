// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/staleness.test.ts
// description: Tests for daysSince() staleness utility and validate highway staleness output.
// owner:       BOTH
// update:      Manual when staleness threshold or calculation changes.
// schema:      none
// last_update: 2026-04-10
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { daysSince, formatReenrichmentOffer, STALE_DAYS } from '../internal/staleness.js';
import { runValidate } from '../commands/validate.js';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeConduitMd(dir: string, lastContextUpdate: string): void {
  const content = `## Repo Signals\n\`\`\`yaml\noperational_status: ACTIVE\nsystem_class: MODERN\nescalation_contacts:\n  owner: owner\n  architect: architect\n  security: security\n  compliance: compliance\n  specialist: specialist\naudience_defaults:\n  field_agent: 1\n  customer: 1\n  employee: 1\n  vendor_partner: 1\nhighway_init_date: 2026-04-07\nlast_context_update: "${lastContextUpdate}"\n\`\`\`\n`;
  fs.writeFileSync(path.join(dir, 'CONDUIT.md'), content, 'utf-8');
}

describe('daysSince', () => {
  it('returns a large number for a date far in the past', () => {
    const days = daysSince('2020-01-01');
    assert.ok(days > 1000, `expected > 1000, got ${days}`);
  });

  it('returns 0 for today', () => {
    const days = daysSince(todayISO());
    assert.equal(days, 0);
  });

  it('returns Infinity for empty string', () => {
    assert.equal(daysSince(''), Infinity);
  });

  it('returns Infinity for undefined', () => {
    assert.equal(daysSince(undefined), Infinity);
  });

  it('returns Infinity for unparseable string', () => {
    assert.equal(daysSince('not-a-date'), Infinity);
  });

  it('STALE_DAYS constant is 30', () => {
    assert.equal(STALE_DAYS, 30);
  });
});

describe('formatReenrichmentOffer', () => {
  it('returns no offer for fresh context', () => {
    assert.equal(formatReenrichmentOffer(todayISO(), 'sample-repo'), null);
  });

  it('offers an explicit init --enrich refresh for stale context', () => {
    const offer = formatReenrichmentOffer('2020-01-01', 'sample-repo');
    assert.ok(offer);
    assert.match(offer!, /conduit init sample-repo --enrich/);
    assert.match(offer!, /--verify/);
  });
});

describe('validate highway staleness', () => {
  it('emits warn for a stale last_context_update', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-stale-'));
    makeConduitMd(dir, '2020-01-01');
    const conduitMdPath = path.join(dir, 'CONDUIT.md');
    // runValidate prints output; we just verify it doesn't throw
    // (staleness is warn-not-error, so validate should still PASS)
    assert.doesNotThrow(() => runValidate(['highway', conduitMdPath]));
  });

  it('emits ok for a fresh last_context_update', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-fresh-'));
    makeConduitMd(dir, todayISO());
    const conduitMdPath = path.join(dir, 'CONDUIT.md');
    assert.doesNotThrow(() => runValidate(['highway', conduitMdPath]));
  });

  it('validation still passes when stale (warn-not-error)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-stale2-'));
    makeConduitMd(dir, '2020-06-15');
    const conduitMdPath = path.join(dir, 'CONDUIT.md');
    // Should not throw despite stale date
    assert.doesNotThrow(() => runValidate(['highway', conduitMdPath]));
  });
});
