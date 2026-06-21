// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/initiative.ts
// description: `conduit initiative` command — manage personal initiatives
//              with Eisenhower-matrix quadrant classification.
// owner:       BOTH
// update:      Manual when initiative subcommands or flags change.
// schema:      initiatives/registry.yaml
// last_update: 2026-06-19
// ─────────────────────────────────────────────────────────────────────

import { parseFlagValue, resolveRepoPath, resolveConvoyRoot } from '../utils.js';
import {
  addInitiative,
  setInitiative,
  loadInitiatives,
  quadrant,
  Level,
  Initiative,
} from '../internal/initiatives.js';

/**
 * Validate and coerce a flag value to Level.
 * parseFlagValue returns '' (empty string) when the flag is absent, so we
 * treat '' as "not provided" (returns undefined).
 */
function asLevel(v: string, name: string): Level | undefined {
  if (v === '') return undefined;
  if (v !== 'high' && v !== 'low') throw new Error(`CONDUIT: --${name} must be 'high' or 'low'`);
  return v;
}

export async function runInitiative(args: string[], rootOverride?: string): Promise<void> {
  let root: string;
  let rest: string[];

  if (rootOverride !== undefined) {
    root = rootOverride;
    rest = args;
  } else {
    const r = resolveRepoPath(args);
    root = resolveConvoyRoot(r.repoPath);
    rest = r.remaining;
  }

  const [sub, ...subArgs] = rest;

  if (sub === 'new') {
    const { value: title, remaining: a1 } = parseFlagValue(subArgs, '--title');
    const { value: urgency, remaining: a2 } = parseFlagValue(a1, '--urgency');
    const { value: importance, remaining: a3 } = parseFlagValue(a2, '--importance');
    if (a3.length > 0) throw new Error(`CONDUIT: unexpected arguments: ${a3.join(' ')}`);
    if (!title) throw new Error('CONDUIT: initiative new requires --title');

    const created = addInitiative(root, {
      title,
      urgency: asLevel(urgency, 'urgency'),
      importance: asLevel(importance, 'importance'),
    });
    console.log(`CONDUIT: created initiative ${created.id} [${quadrant(created)}]`);
    return;
  }

  if (sub === 'set') {
    const id = subArgs[0];
    if (!id) throw new Error('CONDUIT: initiative set requires <id>');

    const { value: urgency, remaining: a1 } = parseFlagValue(subArgs.slice(1), '--urgency');
    const { value: importance, remaining: a2 } = parseFlagValue(a1, '--importance');
    const { value: status, remaining: a3 } = parseFlagValue(a2, '--status');
    if (a3.length > 0) throw new Error(`CONDUIT: unexpected arguments: ${a3.join(' ')}`);
    if (status && status !== 'active' && status !== 'done') {
      throw new Error("CONDUIT: --status must be 'active' or 'done'");
    }

    // Build patch with only the keys whose flag was actually provided (non-empty
    // string). This prevents Object.assign inside setInitiative from overwriting
    // existing urgency/importance with undefined when only --status is given.
    const patch: Partial<Pick<Initiative, 'urgency' | 'importance' | 'status'>> = {};
    const levelUrgency = asLevel(urgency, 'urgency');
    const levelImportance = asLevel(importance, 'importance');
    if (levelUrgency !== undefined) patch.urgency = levelUrgency;
    if (levelImportance !== undefined) patch.importance = levelImportance;
    if (status) patch.status = status as 'active' | 'done';

    const updated = setInitiative(root, id, patch);
    console.log(`CONDUIT: updated initiative ${updated.id} [${quadrant(updated)}]`);
    return;
  }

  if (sub === 'list' || sub === undefined) {
    const all = loadInitiatives(root);
    if (all.length === 0) {
      console.log('CONDUIT: no initiatives yet. Create one: conduit initiative new --title "..."');
      return;
    }
    for (const i of all) {
      console.log(`${i.id}\t[${quadrant(i)}]\t${i.status}\t${i.title}`);
    }
    return;
  }

  throw new Error(`CONDUIT: unknown initiative subcommand '${sub}'`);
}
