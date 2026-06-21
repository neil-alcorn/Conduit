// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/sanitizer.ts
// description: Ingress sanitizer. Reads patterns.yaml and applies them inline.
// owner:       BOTH
// update:      Manual when ingress sanitization behavior changes.
// schema:      security/sanitizer/patterns.yaml
// last_update: 2026-04-07
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

interface PatternGroup {
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  patterns?: string[];
  max_input_chars?: number;
  action?: string;
}

interface PatternsFile {
  version: string;
  patterns: Record<string, PatternGroup>;
  actions: Record<string, string>;
}

export interface SanitizeResult {
  allowed: boolean;
  sanitized: string;
  decision: string;
  matches: string[];
}

/** Locate the conduit install root (where this CLI lives), independent of
 *  the caller's cwd. patterns.yaml lives here, never in the target repo —
 *  running `conduit convoy new` from any target repo must still reach
 *  conduit's sanitizer rules. dist/cli/src/internal/sanitizer.js → four dirs up. */
function getConduitInstallRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

export function sanitize(commandName: string, input: string, repoRoot?: string): SanitizeResult {
  // repoRoot names where to write the audit log (target-repo-local), but
  // patterns always load from the conduit install itself.
  const logRoot = repoRoot ?? findRepoRoot();
  const patternsRoot = getConduitInstallRoot();

  let patternsFile: PatternsFile;
  try {
    const raw = fs.readFileSync(path.join(patternsRoot, 'security', 'sanitizer', 'patterns.yaml'), 'utf-8');
    patternsFile = yaml.load(raw) as PatternsFile;
  } catch {
    // Fail closed if patterns unavailable
    appendLog(logRoot, commandName, input, 'block', ['sanitizer_unavailable']);
    throw new Error('sanitizer unavailable: fail closed — patterns.yaml missing from conduit install');
  }

  const matches: string[] = [];
  let decision = 'allow';

  for (const [groupName, group] of Object.entries(patternsFile.patterns)) {
    // Context flooding check
    if (group.max_input_chars !== undefined && input.length > group.max_input_chars) {
      matches.push(`${groupName}:context_flooding`);
      const action = patternsFile.actions[group.severity] ?? 'block_and_escalate';
      decision = resolveDecision(decision, action);
      continue;
    }

    if (!group.patterns) continue;

    for (const pattern of group.patterns) {
      try {
        const re = new RegExp(pattern, 'i');
        if (re.test(input)) {
          matches.push(`${groupName}:${pattern}`);
          const action = patternsFile.actions[group.severity] ?? 'block_and_escalate';
          decision = resolveDecision(decision, action);
        }
      } catch {
        // Invalid regex in patterns file — skip and log
        matches.push(`${groupName}:invalid_pattern`);
      }
    }
  }

  const allowed = decision === 'allow';
  appendLog(logRoot, commandName, input, decision, matches);

  return {
    allowed,
    sanitized: input,
    decision,
    matches,
  };
}

// block_and_escalate wins over sanitize_and_log wins over allow
function resolveDecision(current: string, incoming: string): string {
  const priority: Record<string, number> = { block_and_escalate: 2, sanitize_and_log: 1, allow: 0 };
  const currentP = priority[current] ?? 0;
  const incomingP = priority[incoming] ?? 0;
  return incomingP > currentP ? incoming : current;
}

function appendLog(repoRoot: string, commandName: string, input: string, decision: string, patterns: string[]): void {
  try {
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    const entry = `${new Date().toISOString()} command=${commandName} input_sha256=${hash} decision=${decision} patterns=${patterns.join(',')}`;
    const logPath = path.join(repoRoot, '.conduit', 'sanitizer.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, entry + '\n', 'utf-8');
  } catch {
    // Log failure is non-fatal — do not surface to caller
  }
}

export function findRepoRoot(startDir?: string): string {
  let current = startDir ?? process.cwd();
  while (true) {
    if (fs.existsSync(path.join(current, '.conduit'))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('repo root not found (.conduit directory not found in any parent)');
    current = parent;
  }
}
