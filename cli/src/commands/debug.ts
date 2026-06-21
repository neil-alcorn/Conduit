// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/debug.ts
// description: Scientific method debugging with cross-session state persistence.
//              Implements directives/shared/debug-protocol.md.
// owner:       BOTH
// update:      Manual as debug behavior changes.
// schema:      conduit-core DebugSession type
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { resolveRepoPath, resolveConvoyRoot, parseFlagValue, currentActor } from '../utils.js';
import { checkPermission } from '../internal/signals.js';
import { sanitize } from '../internal/sanitizer.js';

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

function generateDebugId(): string {
  const num = Date.now() % 1000000;
  return `DBG-${String(num).padStart(6, '0')}`;
}

function getDebugDir(repoPath: string, convoy: { root: string } | null): string {
  if (convoy) {
    const dir = path.join(convoy.root, 'sessions');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  // No active convoy — use .conduit/debug/
  const dir = path.join(repoPath, '.conduit', 'debug');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

interface DebugState {
  id: string;
  convoy_id?: string;
  title: string;
  symptom: string;
  status: string;
  hypotheses: Array<{ id: string; description: string; status: string; evidence_for: string[]; evidence_against: string[] }>;
  evidence: Array<{ type: string; description: string; collected_at: string }>;
  root_cause?: string;
  fix_description?: string;
  fix_verified?: boolean;
  created_at: string;
  updated_at: string;
  session_count: number;
}

export async function runDebug(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit debug <start|status|hypothesize|evidence|resolve|list> [args] [--repo path]');
    console.log('');
    console.log('Subcommands:');
    console.log('  start       Start a new debug session with symptom description');
    console.log('  status      Show current debug session state');
    console.log('  hypothesize Add or update a hypothesis');
    console.log('  evidence    Add evidence to current session');
    console.log('  resolve     Mark debug session as resolved with root cause');
    console.log('  list        List all debug sessions');
    return;
  }

  const subcommand = args[0];
  const { remaining, repoPath } = resolveRepoPath(args.slice(1));
  const { value: convoyIdFlag, remaining: afterConvoy } = parseFlagValue(remaining, '--convoy');

  switch (subcommand) {
    case 'start': {
      checkPermission(repoPath, 'write');
      const { value: title } = parseFlagValue(afterConvoy, '--title');
      const symptom = afterConvoy.filter(a => !a.startsWith('--')).join(' ');
      if (!symptom && !title) throw new Error('usage: conduit debug start "symptom description" --title "short title"');

      const sanitized = sanitize('debug_start', symptom || title, repoPath);
      if (!sanitized.allowed) throw new Error(`CONDUIT: input blocked by sanitizer: ${sanitized.matches.join(', ')}`);

      const convoy = findActiveConvoy(repoPath, convoyIdFlag);
      const debugDir = getDebugDir(repoPath, convoy);
      const debugId = generateDebugId();

      const session: DebugState = {
        id: debugId,
        convoy_id: convoy?.id,
        title: title || symptom.slice(0, 80),
        symptom: symptom || title,
        status: 'investigating',
        hypotheses: [],
        evidence: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_count: 1,
      };

      const sessionPath = path.join(debugDir, `debug-${debugId}.json`);
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');

      // Update convoy.yaml if active
      if (convoy) {
        const yamlPath = path.join(convoy.root, 'convoy.yaml');
        if (fs.existsSync(yamlPath)) {
          let yaml = fs.readFileSync(yamlPath, 'utf-8');
          if (yaml.includes('active_debug_sessions:')) {
            yaml = yaml.replace(/active_debug_sessions:\s*\[([^\]]*)\]/, (match, inner) => {
              const existing = inner.trim() ? inner.trim() + ', ' : '';
              return `active_debug_sessions: [${existing}"${debugId}"]`;
            });
            fs.writeFileSync(yamlPath, yaml, 'utf-8');
          }
        }
      }

      console.log(`CONDUIT: debug session ${debugId} started`);
      console.log(`  Symptom: ${session.symptom}`);
      console.log(`  File:    ${sessionPath}`);
      console.log('');
      console.log('Debug protocol (directives/shared/debug-protocol.md):');
      console.log('  1. Reproduce the symptom — confirm it is real');
      console.log('  2. Gather evidence (logs, stack traces, test output)');
      console.log('  3. Form hypotheses: conduit debug hypothesize --session ' + debugId + ' "hypothesis"');
      console.log('  4. Test top hypothesis');
      console.log('  5. Fix and verify');
      console.log('  6. Resolve: conduit debug resolve --session ' + debugId + ' --cause "root cause"');
      return;
    }

    case 'status': {
      checkPermission(repoPath, 'read');
      const { value: sessionId } = parseFlagValue(afterConvoy, '--session');
      if (!sessionId) throw new Error('usage: conduit debug status --session DBG-NNNNNN');

      const convoy = findActiveConvoy(repoPath, convoyIdFlag);
      const debugDir = getDebugDir(repoPath, convoy);
      const sessionPath = path.join(debugDir, `debug-${sessionId}.json`);
      if (!fs.existsSync(sessionPath)) throw new Error(`debug session ${sessionId} not found`);

      const session: DebugState = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      console.log(`CONDUIT: debug session ${session.id}`);
      console.log(`  Title:      ${session.title}`);
      console.log(`  Status:     ${session.status}`);
      console.log(`  Symptom:    ${session.symptom}`);
      console.log(`  Sessions:   ${session.session_count}`);
      console.log(`  Hypotheses: ${session.hypotheses.length}`);
      console.log(`  Evidence:   ${session.evidence.length}`);
      if (session.root_cause) console.log(`  Root cause: ${session.root_cause}`);
      if (session.hypotheses.length > 0) {
        console.log('');
        console.log('Hypotheses:');
        for (const h of session.hypotheses) {
          console.log(`  ${h.id}  [${h.status}]  ${h.description}`);
        }
      }
      return;
    }

    case 'hypothesize': {
      checkPermission(repoPath, 'write');
      const { value: sessionId } = parseFlagValue(afterConvoy, '--session');
      if (!sessionId) throw new Error('usage: conduit debug hypothesize --session DBG-NNNNNN "hypothesis"');

      const hypothesis = afterConvoy.filter(a => !a.startsWith('--')).join(' ');
      if (!hypothesis) throw new Error('provide a hypothesis description');

      const sanitized = sanitize('debug_hypothesize', hypothesis, repoPath);
      if (!sanitized.allowed) throw new Error(`CONDUIT: input blocked by sanitizer`);

      const convoy = findActiveConvoy(repoPath, convoyIdFlag);
      const debugDir = getDebugDir(repoPath, convoy);
      const sessionPath = path.join(debugDir, `debug-${sessionId}.json`);
      if (!fs.existsSync(sessionPath)) throw new Error(`debug session ${sessionId} not found`);

      const session: DebugState = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      const hId = `H-${String(session.hypotheses.length + 1).padStart(3, '0')}`;
      session.hypotheses.push({ id: hId, description: hypothesis, status: 'untested', evidence_for: [], evidence_against: [] });
      session.updated_at = new Date().toISOString();
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');

      console.log(`CONDUIT: hypothesis ${hId} added to session ${sessionId}`);
      console.log(`  ${hypothesis}`);
      console.log(`  Next: design a test to confirm/refute this hypothesis`);
      return;
    }

    case 'evidence': {
      checkPermission(repoPath, 'write');
      const { value: sessionId } = parseFlagValue(afterConvoy, '--session');
      const { value: evType } = parseFlagValue(afterConvoy, '--type');
      if (!sessionId) throw new Error('usage: conduit debug evidence --session DBG-NNNNNN --type log "description"');

      const description = afterConvoy.filter(a => !a.startsWith('--')).join(' ');

      const convoy = findActiveConvoy(repoPath, convoyIdFlag);
      const debugDir = getDebugDir(repoPath, convoy);
      const sessionPath = path.join(debugDir, `debug-${sessionId}.json`);
      if (!fs.existsSync(sessionPath)) throw new Error(`debug session ${sessionId} not found`);

      const session: DebugState = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      session.evidence.push({
        type: evType || 'observation',
        description: description || '(no description)',
        collected_at: new Date().toISOString(),
      });
      session.status = 'hypothesis-testing';
      session.updated_at = new Date().toISOString();
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');

      console.log(`CONDUIT: evidence added to session ${sessionId} (${session.evidence.length} total)`);
      return;
    }

    case 'resolve': {
      checkPermission(repoPath, 'write');
      const { value: sessionId } = parseFlagValue(afterConvoy, '--session');
      const { value: cause } = parseFlagValue(afterConvoy, '--cause');
      const { value: fix } = parseFlagValue(afterConvoy, '--fix');
      if (!sessionId || !cause) throw new Error('usage: conduit debug resolve --session DBG-NNNNNN --cause "root cause" --fix "fix description"');

      const convoy = findActiveConvoy(repoPath, convoyIdFlag);
      const debugDir = getDebugDir(repoPath, convoy);
      const sessionPath = path.join(debugDir, `debug-${sessionId}.json`);
      if (!fs.existsSync(sessionPath)) throw new Error(`debug session ${sessionId} not found`);

      const session: DebugState = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      session.status = 'resolved';
      session.root_cause = cause;
      session.fix_description = fix || undefined;
      session.fix_verified = true;
      session.updated_at = new Date().toISOString();
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');

      // Remove from convoy active_debug_sessions
      if (convoy) {
        const yamlPath = path.join(convoy.root, 'convoy.yaml');
        if (fs.existsSync(yamlPath)) {
          let yaml = fs.readFileSync(yamlPath, 'utf-8');
          yaml = yaml.replace(new RegExp(`"${sessionId}",?\\s*`), '');
          fs.writeFileSync(yamlPath, yaml, 'utf-8');
        }
      }

      console.log(`CONDUIT: debug session ${sessionId} resolved`);
      console.log(`  Root cause: ${cause}`);
      if (fix) console.log(`  Fix: ${fix}`);
      return;
    }

    case 'list': {
      checkPermission(repoPath, 'read');
      const convoy = findActiveConvoy(repoPath, convoyIdFlag);
      const debugDir = getDebugDir(repoPath, convoy);

      if (!fs.existsSync(debugDir)) {
        console.log('CONDUIT: no debug sessions found');
        return;
      }

      const files = fs.readdirSync(debugDir).filter(f => f.startsWith('debug-') && f.endsWith('.json'));
      if (files.length === 0) {
        console.log('CONDUIT: no debug sessions found');
        return;
      }

      console.log('ID          Status              Title');
      console.log('----------  ------------------  -----');
      for (const file of files) {
        const session: DebugState = JSON.parse(fs.readFileSync(path.join(debugDir, file), 'utf-8'));
        console.log(`${session.id.padEnd(10)}  ${session.status.padEnd(18)}  ${session.title}`);
      }
      return;
    }

    default:
      throw new Error(`unknown debug subcommand: ${subcommand}`);
  }
}
