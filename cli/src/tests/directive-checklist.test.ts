// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/directive-checklist.test.ts
// description: Tests for the stage-directive Gate N Criteria parser used by
//              `conduit pre-gate` (CLI-2). Verifies AC-9 backward-compat
//              (directives without **id** prefixes parse to zero items
//              cleanly) and the multi-gate isolation rule.
// owner:       BOTH
// update:      Manual when directive-checklist contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDirectiveChecklist } from '../internal/directive-checklist.js';

describe('parseDirectiveChecklist — AC-9 backward-compat', () => {
  it('returns empty array when the directive has no Gate N Criteria section', () => {
    const md = [
      '# Stage 3 — Implementation Directive',
      '',
      '## Step 1',
      'Read the spec.',
      '',
      '## Common Failure Modes',
      'Do not skip schema-first.',
    ].join('\n');
    assert.deepEqual(parseDirectiveChecklist(md, 3), []);
  });

  it('returns empty array when the section has only non-prefixed items (legacy directive)', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '',
      '- [ ] All tests pass locally',
      '- [ ] Linter passes',
      '- [ ] No console.log statements',
      '',
      '## Common Failure Modes',
    ].join('\n');
    assert.deepEqual(parseDirectiveChecklist(md, 3), []);
  });
});

describe('parseDirectiveChecklist — extraction', () => {
  it('extracts items with `**check-id**:` prefix and ignores items without', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      'Before requesting Gate 3 approval, verify ALL of the following:',
      '',
      '- [ ] Every acceptance criterion has at least one test case',
      '- [ ] **tests**: All tests pass locally (`npm run test`)',
      '- [ ] **lint**: Linter passes (`npm run lint`)',
      '- [ ] No secrets in code',
      '- [ ] **console-log-audit**: No `console.log` statements left in production code paths',
      '',
      '## Common Failure Modes',
    ].join('\n');
    const out = parseDirectiveChecklist(md, 3);
    assert.deepEqual(
      out.map(i => i.id),
      ['tests', 'lint', 'console-log-audit'],
    );
    assert.equal(out[0].label, 'All tests pass locally (`npm run test`)');
    assert.equal(out[1].label, 'Linter passes (`npm run lint`)');
    assert.equal(out[2].label, 'No `console.log` statements left in production code paths');
  });

  it('stops at the next H2 — does not bleed into adjacent sections', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '- [ ] **tests**: tests pass',
      '',
      '## Gate 4 Criteria (Pre-Gate Checklist)',
      '- [ ] **regression**: regression suite passes',
    ].join('\n');
    const gate3 = parseDirectiveChecklist(md, 3);
    assert.deepEqual(gate3.map(i => i.id), ['tests']);
  });

  it('isolates Gate 5 from Gate 3 in the same directive', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '- [ ] **tests**: tests pass',
      '- [ ] **lint**: lint clean',
      '',
      '## Gate 5 Criteria (Pre-Gate Checklist)',
      '- [ ] **audit-summary**: npm audit clean',
      '- [ ] **owasp-checklist**: OWASP Top 10 reviewed',
    ].join('\n');
    const gate5 = parseDirectiveChecklist(md, 5);
    assert.deepEqual(gate5.map(i => i.id), ['audit-summary', 'owasp-checklist']);
    const gate3 = parseDirectiveChecklist(md, 3);
    assert.deepEqual(gate3.map(i => i.id), ['tests', 'lint']);
  });

  it('returns empty when asked for a gate number not present in the directive', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '- [ ] **tests**: tests pass',
    ].join('\n');
    assert.deepEqual(parseDirectiveChecklist(md, 5), []);
  });

  it('accepts kebab-case ids with digits and hyphens', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '- [ ] **lint-2**: secondary lint pass',
      '- [ ] **a11y-axe**: axe-core scan',
    ].join('\n');
    const out = parseDirectiveChecklist(md, 3);
    assert.deepEqual(out.map(i => i.id), ['lint-2', 'a11y-axe']);
  });

  it('does not pick up `**emphasis**:` text that is not at the start of a checklist item', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '',
      'Some prose with **emphasis**: bold text.',
      '',
      '- [ ] **tests**: real check',
    ].join('\n');
    const out = parseDirectiveChecklist(md, 3);
    assert.deepEqual(out.map(i => i.id), ['tests']);
  });
});

describe('parseDirectiveChecklist — per-check timeout override (defect #3)', () => {
  it('parses (timeout: 600s) annotation and exposes timeoutMs in milliseconds', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '- [ ] **tests** (timeout: 600s): All tests pass',
    ].join('\n');
    const out = parseDirectiveChecklist(md, 3);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'tests');
    assert.equal(out[0].label, 'All tests pass');
    assert.equal(out[0].timeoutMs, 600000);
  });

  it('parses (timeout: 900s) for a higher override', () => {
    const md = [
      '## Gate 4 Criteria (Pre-Gate Checklist)',
      '- [ ] **integration** (timeout: 900s): Long integration suite',
    ].join('\n');
    const out = parseDirectiveChecklist(md, 4);
    assert.equal(out[0].timeoutMs, 900000);
  });

  it('omits timeoutMs when no annotation is present (backward-compat)', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '- [ ] **tests**: All tests pass',
      '- [ ] **lint**: Linter clean',
    ].join('\n');
    const out = parseDirectiveChecklist(md, 3);
    assert.equal(out[0].timeoutMs, undefined);
    assert.equal(out[1].timeoutMs, undefined);
  });

  it('handles mixed annotated and bare items in one checklist', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '- [ ] **build**: build clean',
      '- [ ] **tests** (timeout: 600s): tests pass',
      '- [ ] **lint**: lint clean',
    ].join('\n');
    const out = parseDirectiveChecklist(md, 3);
    assert.deepEqual(out.map(i => i.id), ['build', 'tests', 'lint']);
    assert.equal(out[0].timeoutMs, undefined);
    assert.equal(out[1].timeoutMs, 600000);
    assert.equal(out[2].timeoutMs, undefined);
  });

  it('falls back to no override when timeout annotation is malformed (missing `s` suffix)', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '- [ ] **tests** (timeout: 600): malformed — no `s`',
    ].join('\n');
    const out = parseDirectiveChecklist(md, 3);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'tests');
    assert.equal(out[0].timeoutMs, undefined, 'malformed annotation falls back to default');
  });

  it('falls back to no override when timeout value is non-numeric', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '- [ ] **tests** (timeout: invalid): bad input',
    ].join('\n');
    const out = parseDirectiveChecklist(md, 3);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'tests');
    assert.equal(out[0].timeoutMs, undefined);
  });

  it('tolerates extra whitespace inside the timeout annotation', () => {
    const md = [
      '## Gate 3 Criteria (Pre-Gate Checklist)',
      '- [ ] **tests** ( timeout:  600s ): with whitespace',
    ].join('\n');
    const out = parseDirectiveChecklist(md, 3);
    assert.equal(out[0].timeoutMs, 600000);
  });
});
