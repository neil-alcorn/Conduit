// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/plan.ts
// description: Spec-driven planning — requirements → impact map → task graph.
//              Implements directives/shared/spec-driven-planning.md.
// owner:       BOTH
// update:      Manual as planning behavior changes.
// schema:      conduit-core PlanSpec type
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { resolveRepoPath, resolveConvoyRoot, parseFlagValue, currentActor, todayISO, ConduitNotInitializedError } from '../utils.js';
import { checkPermission } from '../internal/signals.js';
import { sanitize } from '../internal/sanitizer.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';
import { agentName } from '../internal/agent-name.js';
import { isHeadless } from '../internal/headless-io.js';
import { loadHeadlessContext, backfillConvoyArg, type ContextSchema } from '../internal/context-parser.js';

/** Headless CONTEXT schema (headless-protocol §a) — declared here, validated
 *  before the command body runs. */
const HEADLESS_SCHEMA: ContextSchema = { command: 'plan', required: ['convoy_id'] };

// Subcommands: init, show, approve
// conduit plan init [convoy-id] --title "..." — create plan.md from living-spec
// conduit plan show [convoy-id] — display current plan status
// conduit plan approve [convoy-id] — mark plan as human-reviewed

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

function readConvoyField(convoyRoot: string, field: string): string {
  const yamlPath = path.join(convoyRoot, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) return '';
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const match = content.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : '';
}

function generatePlanId(convoyRoot: string): string {
  // PLN-NNNNNN — sequential within convoy
  const planPath = path.join(convoyRoot, 'plan.md');
  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf-8');
    const match = content.match(/PLN-(\d{6})/);
    if (match) return `PLN-${match[1]}`; // reuse existing ID
  }
  // Generate new — use timestamp-based for uniqueness
  const num = Date.now() % 1000000;
  return `PLN-${String(num).padStart(6, '0')}`;
}

export async function runPlan(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit plan <init|show|approve> [convoy-id] [--repo path]');
    console.log('');
    console.log('Subcommands:');
    console.log('  init     Create plan.md scaffold from living-spec (Stage 0-2)');
    console.log('  show     Display current plan status and task summary');
    console.log('  approve  Mark plan as human-reviewed (required before execution)');
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
      const { value: title } = parseFlagValue(remaining, '--title');
      const convoy = findActiveConvoy(repoPath, remaining[0]);

      // Sanitize title input
      if (title) {
        const check = sanitize('plan_init', title, repoPath);
        if (!check.allowed) throw new Error(`CONDUIT: plan title blocked by sanitizer: ${check.matches.join(', ')}`);
      }

      const planPath = path.join(convoy.root, 'plan.md');
      if (fs.existsSync(planPath)) {
        const content = fs.readFileSync(planPath, 'utf-8');
        if (!content.includes('Status: draft')) {
          throw new Error('CONDUIT: plan already exists and is not in draft status. Use a new convoy for a new plan.');
        }
      }

      // Read living-spec for requirements seeding
      const specPath = path.join(convoy.root, 'living-spec.md');
      const hasSpec = fs.existsSync(specPath);
      const convoyTitle = readConvoyField(convoy.root, 'title') || convoy.id;
      const workType = readConvoyField(convoy.root, 'work_type') || 'net-new';
      const planId = generatePlanId(convoy.root);

      // Ensure directories exist
      const researchDir = path.join(convoy.root, 'research');
      const sessionsDir = path.join(convoy.root, 'sessions');
      if (!fs.existsSync(researchDir)) fs.mkdirSync(researchDir, { recursive: true });
      if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

      const planContent = `<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        plan.md
# description: Structured implementation plan for convoy ${convoy.id}.
# owner:       AGENT (created by spec-driven-planning directive)
# update:      Regenerated when plan changes.
# schema:      conduit-core PlanSpec type
# last_update: ${todayISO()}
# ─────────────────────────────────────────────────────────────────────
-->

# Implementation Plan: ${title || convoyTitle}

## Plan ID: ${planId}
## Convoy: ${convoy.id}
## Status: draft
## Work Type: ${workType}
## Created: ${new Date().toISOString()}
## Created By: ${currentActor()}

---

## Requirements

> Source: ${hasSpec ? 'living-spec.md' : '(living-spec.md not found — add requirements manually)'}

| ID | Description | Acceptance Criteria | Source |
|----|-------------|---------------------|--------|
| R-001 | | | |

---

## Impact Map

> Scan actual codebase before filling this section.
> Every file path must be verified via Glob. Every symbol via Grep.
> See directives/shared/spec-driven-planning.md Phase 2.

| Repo | Files Affected | Change Type | Symbols Referenced | Rationale |
|------|---------------|-------------|-------------------|-----------|
| | | | | |

---

## Design Decisions

1.

---

## Constraints

-

---

## Task Graph

| ID | Title | Repo | Depends On | Priority | Wave | Status |
|----|-------|------|-----------|----------|------|--------|
| T-001 | | | — | high | 1 | pending |

---

## Acceptance Criteria per Task

### T-001: [title]
- [ ]
- Operations: <!-- list shell commands this task will run, e.g. npm run build, npm test -->

---

> **Human Review Required**: This plan must be reviewed before execution begins.
> Run: \`conduit plan approve ${convoy.id}\`
`;

      fs.writeFileSync(planPath, planContent, 'utf-8');

      // Update convoy.yaml with plan_spec_id if field exists
      const yamlPath = path.join(convoy.root, 'convoy.yaml');
      if (fs.existsSync(yamlPath)) {
        let yamlContent = fs.readFileSync(yamlPath, 'utf-8');
        if (yamlContent.includes('plan_spec_id:')) {
          yamlContent = yamlContent.replace(/plan_spec_id:\s*["']?[^"'\n]*["']?/, `plan_spec_id: "${planId}"`);
          fs.writeFileSync(yamlPath, yamlContent, 'utf-8');
        }
      }

      // Audit event
      appendConvoyEvent({
        ts: new Date().toISOString(),
        type: 'stage_started',
        convoy: convoy.id,
        notes: `plan ${planId} initialized (spec-driven-planning directive)`,
      }, convoy.root);

      console.log(`CONDUIT: plan ${planId} initialized for convoy ${convoy.id}`);
      console.log(`  ${planPath}`);
      console.log('');
      console.log('Next steps:');
      console.log(`  1. ${agentName()}: read living-spec.md → populate Requirements`);
      console.log(`  2. ${agentName()}: scan codebase → populate Impact Map (use your host's grep/glob — never guess)`);
      console.log(`  3. ${agentName()}: decompose into Task Graph with waves`);
      console.log(`  4. Human review: conduit plan approve ${convoy.id}`);
      return;
    }

    case 'show': {
      checkPermission(repoPath, 'read');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const planPath = path.join(convoy.root, 'plan.md');
      if (!fs.existsSync(planPath)) {
        console.log(`CONDUIT: no plan found for convoy ${convoy.id}`);
        console.log(`  Create one: conduit plan init ${convoy.id}`);
        return;
      }

      const content = fs.readFileSync(planPath, 'utf-8');
      const statusMatch = content.match(/^## Status:\s*(.+)$/m);
      const planIdMatch = content.match(/^## Plan ID:\s*(.+)$/m);
      const status = statusMatch ? statusMatch[1].trim() : 'unknown';
      const planId = planIdMatch ? planIdMatch[1].trim() : 'unknown';

      // Count tasks
      const taskLines = content.match(/^\| T-\d+/gm) ?? [];
      const pendingTasks = (content.match(/\| pending/g) ?? []).length;
      const completeTasks = (content.match(/\| complete/g) ?? []).length;
      const blockedTasks = (content.match(/\| blocked/g) ?? []).length;

      console.log(`CONDUIT: plan ${planId} for convoy ${convoy.id}`);
      console.log(`  Status:    ${status}`);
      console.log(`  Tasks:     ${taskLines.length} total (${completeTasks} complete, ${pendingTasks} pending, ${blockedTasks} blocked)`);
      console.log(`  File:      ${planPath}`);
      return;
    }

    case 'approve': {
      checkPermission(repoPath, 'write');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const planPath = path.join(convoy.root, 'plan.md');
      if (!fs.existsSync(planPath)) throw new Error(`no plan found for convoy ${convoy.id}`);

      let content = fs.readFileSync(planPath, 'utf-8');
      if (!content.includes('Status: draft') && !content.includes('Status: impact-mapped') && !content.includes('Status: reviewed')) {
        throw new Error('CONDUIT: plan is not in a reviewable state (must be draft, impact-mapped, or reviewed)');
      }

      content = content.replace(/## Status:\s*.+/, `## Status: approved`);
      content = content.replace(/## Approved By:.*\n?/m, '');
      // Insert approved-by after status
      content = content.replace(
        /## Status: approved/,
        `## Status: approved\n## Approved By: ${currentActor()}\n## Approved At: ${new Date().toISOString()}`
      );
      fs.writeFileSync(planPath, content, 'utf-8');

      appendConvoyEvent({
        ts: new Date().toISOString(),
        type: 'stage_started',
        convoy: convoy.id,
        notes: `plan approved by ${currentActor()} — execution unlocked`,
      }, convoy.root);

      console.log(`CONDUIT: plan approved for convoy ${convoy.id} by ${currentActor()}`);
      console.log('  Execution is now unlocked. Run: conduit execute ' + convoy.id);
      return;
    }

    default:
      throw new Error(`unknown plan subcommand: ${subcommand}`);
  }
}
