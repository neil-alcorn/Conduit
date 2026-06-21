// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/session.ts
// description: Session handoff — save/resume context across agent-host sessions
//              (Claude Code, OpenAI Codex CLI, or other agent layer).
//              Implements directives/shared/session-handoff.md.
// owner:       BOTH
// update:      Manual as session behavior changes.
// schema:      conduit-core SessionHandoff type
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { resolveRepoPath, resolveConvoyRoot, parseFlagValue, currentActor } from '../utils.js';
import { checkPermission } from '../internal/signals.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';

function findActiveConvoy(repoPath: string, convoyId?: string): { id: string; root: string } | null {
  const resolved = resolveConvoyRoot(repoPath);
  if (convoyId) {
    const root = path.join(resolved, 'convoys', 'active', convoyId);
    return fs.existsSync(root) ? { id: convoyId, root } : null;
  }
  const activeDir = path.join(resolved, 'convoys', 'active');
  if (!fs.existsSync(activeDir)) return null;
  const dirs = fs.readdirSync(activeDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template');
  if (dirs.length === 1) return { id: dirs[0].name, root: path.join(activeDir, dirs[0].name) };
  return null;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

interface HandoffData {
  id: string;
  convoy_id?: string;
  reason: string;
  summary: string;
  decisions_made: Array<{ decision: string; rationale: string }>;
  work_completed: string[];
  work_remaining: string[];
  blockers: string[];
  files_modified: string[];
  context_notes: string;
  created_at: string;
  created_by: string;
}

export async function runSession(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit session <save|resume|list> [convoy-id] [--repo path]');
    console.log('');
    console.log('Subcommands:');
    console.log('  save     Capture session context for handoff (use before ending session)');
    console.log('  resume   Load latest handoff context (use at session start)');
    console.log('  list     List all session handoffs for a convoy');
    return;
  }

  const subcommand = args[0];
  const { remaining, repoPath } = resolveRepoPath(args.slice(1));

  switch (subcommand) {
    case 'save': {
      checkPermission(repoPath, 'write');
      const { value: reason } = parseFlagValue(remaining, '--reason');
      const { value: summary } = parseFlagValue(remaining, '--summary');
      const { value: notes } = parseFlagValue(remaining, '--notes');
      const convoy = findActiveConvoy(repoPath, remaining[0]);

      const sessionsDir = convoy
        ? path.join(convoy.root, 'sessions')
        : path.join(repoPath, '.conduit', 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });

      const ts = timestamp();
      const handoffId = `HND-${String(Date.now() % 1000000).padStart(6, '0')}`;

      const handoff: HandoffData = {
        id: handoffId,
        convoy_id: convoy?.id,
        reason: reason || 'context-limit',
        summary: summary || '',
        decisions_made: [],
        work_completed: [],
        work_remaining: [],
        blockers: [],
        files_modified: [],
        context_notes: notes || '',
        created_at: new Date().toISOString(),
        created_by: currentActor(),
      };

      const handoffPath = path.join(sessionsDir, `handoff-${ts}.yaml`);

      // Write as YAML-like format for readability
      const yamlContent = `# Session Handoff — ${handoffId}
# Created: ${handoff.created_at}
# Created by: ${handoff.created_by}
# Convoy: ${handoff.convoy_id || '(none)'}

id: "${handoff.id}"
convoy_id: "${handoff.convoy_id || ''}"
reason: "${handoff.reason}"
created_at: "${handoff.created_at}"
created_by: "${handoff.created_by}"

summary: |
  ${handoff.summary || '(fill in: what was accomplished this session)'}

decisions_made:
  # - decision: "what was decided"
  #   rationale: "why"

work_completed:
  # - "item 1"
  # - "item 2"

work_remaining:
  # - "item 1"
  # - "item 2"

blockers:
  # - "blocker description"

files_modified:
  # - "path/to/file.ts"

context_notes: |
  ${handoff.context_notes || '(fill in: anything the next session needs to know)'}
`;

      fs.writeFileSync(handoffPath, yamlContent, 'utf-8');

      if (convoy) {
        appendConvoyEvent({
          ts: new Date().toISOString(),
          type: 'convoy_paused',
          convoy: convoy.id,
          notes: `session handoff ${handoffId} saved (${reason || 'context-limit'})`,
        }, convoy.root);
      }

      console.log(`CONDUIT: session handoff ${handoffId} saved`);
      console.log(`  ${handoffPath}`);
      console.log('');
      console.log('Fill in the handoff file with:');
      console.log('  - Summary of work done');
      console.log('  - Key decisions made (with rationale)');
      console.log('  - Work completed and remaining');
      console.log('  - Any blockers');
      console.log('  - Files modified');
      console.log('  - Context notes for next session');
      console.log('');
      console.log('To resume: conduit session resume' + (convoy ? ` ${convoy.id}` : ''));
      return;
    }

    case 'resume': {
      checkPermission(repoPath, 'read');
      const convoy = findActiveConvoy(repoPath, remaining[0]);

      const sessionsDir = convoy
        ? path.join(convoy.root, 'sessions')
        : path.join(repoPath, '.conduit', 'sessions');

      if (!fs.existsSync(sessionsDir)) {
        console.log('CONDUIT: no session handoffs found. Starting fresh.');
        if (convoy) console.log(`  Active convoy: ${convoy.id} — run: conduit context ${convoy.id}`);
        return;
      }

      const handoffs = fs.readdirSync(sessionsDir)
        .filter(f => f.startsWith('handoff-') && f.endsWith('.yaml'))
        .sort()
        .reverse();

      if (handoffs.length === 0) {
        console.log('CONDUIT: no session handoffs found. Starting fresh.');
        return;
      }

      const latestPath = path.join(sessionsDir, handoffs[0]);
      const content = fs.readFileSync(latestPath, 'utf-8');

      console.log('━'.repeat(62));
      console.log('CONDUIT SESSION RESUME');
      console.log(`Latest handoff: ${handoffs[0]}`);
      if (convoy) console.log(`Convoy: ${convoy.id}`);
      console.log('━'.repeat(62));
      console.log('');
      console.log(content);
      console.log('');
      console.log('━'.repeat(62));
      console.log('Next steps:');
      if (convoy) {
        console.log(`  1. Run: conduit context ${convoy.id}  (full operating picture)`);
        console.log('  2. Review work_remaining and blockers above');
        console.log('  3. Continue from where the previous session left off');
      } else {
        console.log('  1. Review the handoff above');
        console.log('  2. Continue from where the previous session left off');
      }
      return;
    }

    case 'list': {
      checkPermission(repoPath, 'read');
      const convoy = findActiveConvoy(repoPath, remaining[0]);

      const sessionsDir = convoy
        ? path.join(convoy.root, 'sessions')
        : path.join(repoPath, '.conduit', 'sessions');

      if (!fs.existsSync(sessionsDir)) {
        console.log('CONDUIT: no session handoffs found');
        return;
      }

      const handoffs = fs.readdirSync(sessionsDir)
        .filter(f => f.startsWith('handoff-') && f.endsWith('.yaml'))
        .sort();

      if (handoffs.length === 0) {
        console.log('CONDUIT: no session handoffs found');
        return;
      }

      console.log(`Session handoffs${convoy ? ` for convoy ${convoy.id}` : ''}:`);
      for (const h of handoffs) {
        const content = fs.readFileSync(path.join(sessionsDir, h), 'utf-8');
        const reasonMatch = content.match(/^reason:\s*"(.+)"/m);
        const createdMatch = content.match(/^created_at:\s*"(.+)"/m);
        console.log(`  ${h}  reason: ${reasonMatch?.[1] ?? 'unknown'}  created: ${createdMatch?.[1]?.slice(0, 10) ?? 'unknown'}`);
      }
      return;
    }

    default:
      throw new Error(`unknown session subcommand: ${subcommand}`);
  }
}
