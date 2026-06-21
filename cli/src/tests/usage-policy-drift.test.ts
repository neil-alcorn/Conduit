// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/usage-policy-drift.test.ts
// description: Drift-guard for STAGE_POLICY in usage.ts vs the canonical
//              directives at directives/net-new/stages/0N-*.md. The first
//              bolded **claude-...** id per directive is the recommended
//              model; if the directive changes and the policy table doesn't,
//              this test fails.
// owner:       BOTH
// update:      Manual when STAGE_POLICY shape changes.
// schema:      none
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { STAGE_POLICY } from '../commands/usage.js';

// dist/cli/src/tests/ → repo root
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const stagesDir = path.join(repoRoot, 'directives', 'net-new', 'stages');

function firstBoldedModel(content: string): string | null {
  const m = content.match(/\*\*(claude-(?:opus|sonnet|haiku)-[0-9]+(?:-[0-9]+)?)\*\*/);
  return m ? m[1] : null;
}

function directivePath(stage: number): string {
  const files = fs.readdirSync(stagesDir);
  const prefix = String(stage).padStart(2, '0') + '-';
  const file = files.find(f => f.startsWith(prefix) && f.endsWith('.md'));
  if (!file) throw new Error(`no directive for stage ${stage} under ${stagesDir}`);
  return path.join(stagesDir, file);
}

test('STAGE_POLICY drift — every stage has a directive and a recommended model', () => {
  for (let stage = 0; stage <= 8; stage++) {
    assert.ok(STAGE_POLICY[stage], `STAGE_POLICY missing stage ${stage}`);
    const file = directivePath(stage);
    assert.ok(fs.existsSync(file), `directive missing: ${file}`);
  }
});

test('STAGE_POLICY.recommended matches first bolded model in each directive', () => {
  const mismatches: string[] = [];
  for (let stage = 0; stage <= 8; stage++) {
    const file = directivePath(stage);
    const content = fs.readFileSync(file, 'utf-8');
    const directiveModel = firstBoldedModel(content);
    const policyModel = STAGE_POLICY[stage].recommended;
    if (directiveModel !== policyModel) {
      mismatches.push(`stage ${stage}: directive says ${directiveModel}, STAGE_POLICY says ${policyModel} (file: ${path.basename(file)})`);
    }
  }
  assert.deepEqual(mismatches, [], `STAGE_POLICY drift detected:\n  - ${mismatches.join('\n  - ')}`);
});

test('STAGE_POLICY.required==true ↔ directive contains "REQUIRED"', () => {
  for (let stage = 0; stage <= 8; stage++) {
    const file = directivePath(stage);
    const content = fs.readFileSync(file, 'utf-8');
    const directiveSaysRequired = /\bREQUIRED\b/.test(content);
    const policyRequired = STAGE_POLICY[stage].required === true;

    if (policyRequired && !directiveSaysRequired) {
      assert.fail(`stage ${stage}: STAGE_POLICY marks required but directive does not say REQUIRED (${path.basename(file)})`);
    }
    if (directiveSaysRequired && !policyRequired) {
      // Directive says REQUIRED somewhere but policy doesn't enforce — flag it.
      // (Allow false positives on the word "REQUIRED" appearing in unrelated context
      // by checking proximity to a model id.)
      const requiredNearModel = /REQUIRED[\s\S]{0,200}claude-/i.test(content) ||
                                /claude-[\s\S]{0,200}REQUIRED/.test(content);
      if (requiredNearModel) {
        assert.fail(`stage ${stage}: directive says REQUIRED near a model id but STAGE_POLICY has required:false (${path.basename(file)})`);
      }
    }
  }
});

test('STAGE_POLICY.also_acceptable models referenced (by id or family) in directive', () => {
  // Directives sometimes say "Sonnet" or "Opus" rather than the full id —
  // either form is accepted. Catches outright omission, not stylistic drift.
  function familyToken(model: string): string {
    const m = model.match(/^claude-(opus|sonnet|haiku)-/);
    if (!m) return model;
    return m[1].charAt(0).toUpperCase() + m[1].slice(1);
  }
  const failures: string[] = [];
  for (let stage = 0; stage <= 8; stage++) {
    const file = directivePath(stage);
    const content = fs.readFileSync(file, 'utf-8');
    const accepted = STAGE_POLICY[stage].also_acceptable ?? [];
    for (const model of accepted) {
      const family = familyToken(model);
      const familyRe = new RegExp(`\\b${family}\\b`);
      if (!content.includes(model) && !familyRe.test(content)) {
        failures.push(`stage ${stage}: also_acceptable ${model} (or "${family}") not referenced in ${path.basename(file)}`);
      }
    }
  }
  assert.deepEqual(failures, [], `also_acceptable drift:\n  - ${failures.join('\n  - ')}`);
});
