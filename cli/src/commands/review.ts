// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/review.ts
// description: Code review orchestration — multi-agent review with confidence scoring.
//              Implements directives/shared/code-review-protocol.md.
// owner:       BOTH
// update:      Manual as review behavior changes.
// schema:      conduit-core CodeReview type
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { resolveRepoPath, resolveConvoyRoot, parseFlagValue, currentActor, ConduitNotInitializedError } from '../utils.js';
import { checkPermission } from '../internal/signals.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';
import { agentName } from '../internal/agent-name.js';
import { isHeadless } from '../internal/headless-io.js';
import { loadHeadlessContext, backfillConvoyArg, type ContextSchema } from '../internal/context-parser.js';

/** Headless CONTEXT schema (headless-protocol §a) — declared here, validated
 *  before the command body runs. */
const HEADLESS_SCHEMA: ContextSchema = { command: 'review', required: ['convoy_id'] };

function findActiveConvoy(repoPath: string, convoyId?: string): { id: string; root: string } {
  const resolved = resolveConvoyRoot(repoPath);
  if (convoyId) {
    const root = path.join(resolved, 'convoys', 'active', convoyId);
    if (!fs.existsSync(root)) throw new Error(`convoy ${convoyId} not found`);
    return { id: convoyId, root };
  }
  const activeDir = path.join(resolved, 'convoys', 'active');
  if (!fs.existsSync(activeDir)) throw new ConduitNotInitializedError('no convoys directory found');
  const dirs = fs.readdirSync(activeDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template');
  if (dirs.length === 0) throw new Error('no active convoy found');
  if (dirs.length > 1) throw new Error(`multiple active convoys — specify convoy-id: ${dirs.map(d => d.name).join(', ')}`);
  return { id: dirs[0].name, root: path.join(activeDir, dirs[0].name) };
}

function generateReviewId(): string {
  const num = Date.now() % 1000000;
  return `REV-${String(num).padStart(6, '0')}`;
}

export async function runReview(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit review <init|show|findings> [convoy-id] [--repo path]');
    console.log('');
    console.log('Subcommands:');
    console.log('  init       Initialize review scaffold [--depth quick|standard|deep]');
    console.log('  show       Display review findings summary');
    console.log('  findings   List all findings with severity and disposition');
    return;
  }

  // AC-1/AC-3: CONTEXT from stdin; convoy_id backfills the positional when
  // argv omits it (argv wins when both are present).
  if (isHeadless()) {
    const ctx = loadHeadlessContext(HEADLESS_SCHEMA);
    args = backfillConvoyArg(args, String(ctx['convoy_id']));
  }

  const subcommand = args[0];
  const { remaining, repoPath } = resolveRepoPath(args.slice(1));

  switch (subcommand) {
    case 'init': {
      checkPermission(repoPath, 'write');
      const { value: target } = parseFlagValue(remaining, '--target');
      const { value: wsId } = parseFlagValue(remaining, '--workstream');
      const { value: depth } = parseFlagValue(remaining, '--depth');
      const reviewDepth = (depth === 'quick' || depth === 'deep') ? depth : 'standard';
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const reviewId = generateReviewId();

      const reviewPath = path.join(convoy.root, 'audit', `review-${reviewId}.md`);
      fs.mkdirSync(path.dirname(reviewPath), { recursive: true });

      // Depth determines agent dispatch
      const agentTable = reviewDepth === 'quick'
        ? `| Agent | Focus | Status |
|-------|-------|--------|
| bugs-security | Logic errors, injection patterns, credential exposure | pending |`
        : reviewDepth === 'deep'
        ? `| Agent | Focus | Status |
|-------|-------|--------|
| bugs-logic | Logic errors, off-by-one, null handling, race conditions | pending |
| security-injection | Injection patterns, sanitizer bypass, credential exposure | pending |
| standards-compliance | standards/ adherence, CLAUDE.md rules, naming conventions | pending |
| test-coverage | Missing tests, untested branches, acceptance criteria gaps | pending |
| accessibility | WCAG compliance, ARIA labels, keyboard navigation | pending |
| performance | N+1 queries, unnecessary re-renders, bundle size impact | pending |`
        : `| Agent | Focus | Status |
|-------|-------|--------|
| bugs-logic | Logic errors, off-by-one, null handling, race conditions | pending |
| security-injection | Injection patterns, sanitizer bypass, credential exposure | pending |
| standards-compliance | standards/ adherence, CLAUDE.md rules, naming conventions | pending |
| test-coverage | Missing tests, untested branches, acceptance criteria gaps | pending |`;

      const reviewContent = `<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        audit/review-${reviewId}.md
# description: Code review for convoy ${convoy.id}
# owner:       AGENT
# schema:      conduit-core CodeReview type
# last_update: ${new Date().toISOString().slice(0, 10)}
# ─────────────────────────────────────────────────────────────────────
-->

# Code Review: ${reviewId}

## Convoy: ${convoy.id}
## Workstream: ${wsId || '(all)'}
## Target: ${target || '(current branch changes)'}
## Depth: ${reviewDepth}
## Status: in-progress
## Created: ${new Date().toISOString()}
## Reviewer: ${currentActor()}

---

## Review Agents

Per code-review-protocol.md, launch parallel agents focused on:

${agentTable}

---

## Findings

<!--
Severity vocabulary (authored by reviewer, not inferred):
  blocking    — must be fixed before merge; gate-blocking
  major       — fix in same PR unless filed as follow-up with acknowledgement
  minor       — fix-now or fix-follow-up
  suggestion  — evaluate; any disposition valid including defer

Legacy aliases: must-fix → blocking, should-fix → major.
Stable IDs: FND-NNNN (monotonic within this review).
-->

| # | ID | Severity | Category | File | Line | Description | Confidence | Disposition |
|---|----|----------|----------|------|------|-------------|------------|-------------|
| 1 | FND-0001 | | | | | | | |

---

## Summary

- **Total findings:** 0
- **Blocking:** 0  (legacy: must-fix)
- **Major:** 0     (legacy: should-fix)
- **Minor:** 0
- **Suggestion:** 0
- **Pass:** (no blocking findings = pass)

---

> All findings are shown regardless of confidence score (AC-8).
> Every finding must reference a specific standard from standards/ if applicable.
> Each finding carries a stable ID (FND-NNNN) and severity (blocking/major/minor/suggestion).
> Receiving-review directive (directives/shared/receiving-review.md) references findings by ID.
`;

      fs.writeFileSync(reviewPath, reviewContent, 'utf-8');

      appendConvoyEvent({
        ts: new Date().toISOString(),
        type: 'stage_started',
        convoy: convoy.id,
        notes: `code review ${reviewId} initialized`,
      }, convoy.root);

      console.log(`CONDUIT: review ${reviewId} initialized for convoy ${convoy.id}`);
      console.log(`  ${reviewPath}`);
      console.log('');
      console.log('Next steps:');
      console.log(`  ${agentName()}: launch parallel review agents per code-review-protocol.md`);
      console.log('  Each agent populates findings in the review file');
      console.log(`  Show results: conduit review show ${convoy.id}`);
      return;
    }

    case 'show': {
      checkPermission(repoPath, 'read');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const auditDir = path.join(convoy.root, 'audit');
      if (!fs.existsSync(auditDir)) {
        console.log('CONDUIT: no reviews found');
        return;
      }

      const reviews = fs.readdirSync(auditDir).filter(f => f.startsWith('review-') && f.endsWith('.md'));
      if (reviews.length === 0) {
        console.log(`CONDUIT: no reviews found for convoy ${convoy.id}`);
        console.log(`  Create one: conduit review init ${convoy.id}`);
        return;
      }

      for (const reviewFile of reviews) {
        const content = fs.readFileSync(path.join(auditDir, reviewFile), 'utf-8');
        const statusMatch = content.match(/## Status:\s*(.+)/);
        const findingsMatch = content.match(/\*\*Total findings:\*\*\s*(\d+)/);
        // New-template reviews use **Blocking:**; legacy reviews use **Must-fix:**.
        // Read whichever is present; treat them as equivalent (Stage 2 decision: blocking ≡ must-fix).
        const blockingMatch = content.match(/\*\*Blocking:\*\*\s*(\d+)/)
          ?? content.match(/\*\*Must-fix:\*\*\s*(\d+)/);
        const id = reviewFile.replace('.md', '').replace('review-', '');

        console.log(`  ${id}  status: ${statusMatch?.[1]?.trim() ?? 'unknown'}  findings: ${findingsMatch?.[1] ?? '0'}  blocking: ${blockingMatch?.[1] ?? '0'}`);
      }
      return;
    }

    case 'findings': {
      checkPermission(repoPath, 'read');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const auditDir = path.join(convoy.root, 'audit');
      const reviews = fs.existsSync(auditDir) ? fs.readdirSync(auditDir).filter(f => f.startsWith('review-') && f.endsWith('.md')) : [];

      if (reviews.length === 0) {
        console.log('CONDUIT: no reviews found');
        return;
      }

      // Show latest review's findings table
      const latest = reviews.sort().pop()!;
      const content = fs.readFileSync(path.join(auditDir, latest), 'utf-8');
      const findingsStart = content.indexOf('## Findings');
      const findingsEnd = content.indexOf('## Summary');
      if (findingsStart !== -1 && findingsEnd !== -1) {
        console.log(content.slice(findingsStart, findingsEnd).trim());
      } else {
        console.log('CONDUIT: findings section not found in review');
      }
      return;
    }

    default:
      throw new Error(`unknown review subcommand: ${subcommand}`);
  }
}
