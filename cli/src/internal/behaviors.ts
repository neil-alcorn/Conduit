// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/behaviors.ts
// description: Behavior engine — reads behaviors.yaml for configurable CLI policies.
// owner:       BOTH
// update:      When behavior schema changes.
// schema:      none
// last_update: 2026-04-17
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface Behaviors {
  version: number;
  convoy_create: {
    auto_create_features_from_workstreams: boolean;
  };
  gate_approve: {
    auto_commit: boolean;
    auto_push: boolean;
    auto_publish: boolean;
    advance_workstream_stages: boolean;
  };
  convoy_close: {
    auto_commit: boolean;
    auto_push: boolean;
    auto_publish: boolean;
    archive_convoy: boolean;
  };
  checkpoint: {
    auto_commit: boolean;
    auto_push: boolean;
  };
  usage: {
    auto_commit: boolean;
    auto_push: boolean;
  };
  context: {
    auto_pull: boolean;
    auto_build: boolean;
    auto_install_skills: boolean;
  };
  skills: {
    require_approval: boolean;
  };
  sync: {
    auto_pull_before_sync: boolean;
    sync_on_gate_approve: boolean;
  };
}

const DEFAULTS: Behaviors = {
  version: 1,
  convoy_create: { auto_create_features_from_workstreams: true },
  gate_approve: { auto_commit: true, auto_push: true, auto_publish: false, advance_workstream_stages: true },
  convoy_close: { auto_commit: true, auto_push: true, auto_publish: false, archive_convoy: true },
  checkpoint: { auto_commit: true, auto_push: true },
  usage: { auto_commit: false, auto_push: false },
  context: { auto_pull: true, auto_build: true, auto_install_skills: true },
  skills: { require_approval: true },
  sync: { auto_pull_before_sync: true, sync_on_gate_approve: false },
};

let cached: Behaviors | null = null;

/**
 * Load behaviors from behaviors.yaml in the conduit repo root.
 * Falls back to defaults if the file is missing or malformed.
 * Caches the result for the duration of the CLI command.
 */
export function loadBehaviors(repoPath: string): Behaviors {
  if (cached) return cached;

  const filePath = path.join(repoPath, 'behaviors.yaml');
  if (!fs.existsSync(filePath)) {
    cached = { ...DEFAULTS };
    return cached;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(raw) as Partial<Behaviors>;
    // Deep merge with defaults — any missing key gets the default
    cached = {
      version: parsed.version ?? DEFAULTS.version,
      convoy_create: { ...DEFAULTS.convoy_create, ...parsed.convoy_create },
      gate_approve: { ...DEFAULTS.gate_approve, ...parsed.gate_approve },
      convoy_close: { ...DEFAULTS.convoy_close, ...parsed.convoy_close },
      checkpoint: { ...DEFAULTS.checkpoint, ...parsed.checkpoint },
      usage: { ...DEFAULTS.usage, ...parsed.usage },
      context: { ...DEFAULTS.context, ...parsed.context },
      skills: { ...DEFAULTS.skills, ...parsed.skills },
      sync: { ...DEFAULTS.sync, ...parsed.sync },
    };
    return cached;
  } catch {
    console.warn('CONDUIT warn: behaviors.yaml is malformed — using defaults');
    cached = { ...DEFAULTS };
    return cached;
  }
}

/**
 * Clear the cache (useful for testing).
 */
export function clearBehaviorCache(): void {
  cached = null;
}
