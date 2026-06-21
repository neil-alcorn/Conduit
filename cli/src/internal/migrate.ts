// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/migrate.ts
// description: Pure-function helpers for `conduit migrate-stray-registry`
//              (CLI-4 / AC-20). Convoy schema validation, id-collision
//              detection, path-safety checks. No filesystem mutation here —
//              the command handler does the actual fs.cpSync / git ops.
// owner:       BOTH
// update:      Manual when migrate contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';

export interface ScannedConvoy {
  id: string;
  bucket: 'active' | 'archive';
  sourceDir: string;
}

export interface MigrationPlan {
  toMigrate: ScannedConvoy[];
  collisions: ScannedConvoy[];
  invalid: { dir: string; reason: string }[];
}

const CONVOY_ID_PATTERN = /^id:\s*["']?([^"'\n]+)["']?/m;

/** Scan `<sourceRepo>/convoys/{active,archive}/` for valid convoy directories.
 *  Each directory must contain a convoy.yaml with at least an `id:` field. */
export function scanSourceConvoys(sourceRepo: string): ScannedConvoy[] {
  const found: ScannedConvoy[] = [];
  for (const bucket of ['active', 'archive'] as const) {
    const root = path.join(sourceRepo, 'convoys', bucket);
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '_template') continue;
      const yamlPath = path.join(root, entry.name, 'convoy.yaml');
      if (!fs.existsSync(yamlPath)) continue;
      const content = fs.readFileSync(yamlPath, 'utf-8');
      const m = content.match(CONVOY_ID_PATTERN);
      if (!m) continue;
      found.push({
        id: m[1].trim(),
        bucket,
        sourceDir: path.join(root, entry.name),
      });
    }
  }
  return found;
}

/** List convoy IDs already present in the central repo across active + archive. */
export function listCentralConvoyIds(centralRepo: string): Set<string> {
  const out = new Set<string>();
  for (const bucket of ['active', 'archive'] as const) {
    const root = path.join(centralRepo, 'convoys', bucket);
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== '_template') out.add(entry.name);
    }
  }
  return out;
}

export function buildMigrationPlan(
  sourceRepo: string,
  centralRepo: string,
): MigrationPlan {
  const scanned = scanSourceConvoys(sourceRepo);
  const central = listCentralConvoyIds(centralRepo);
  const toMigrate: ScannedConvoy[] = [];
  const collisions: ScannedConvoy[] = [];
  const invalid: { dir: string; reason: string }[] = [];

  for (const c of scanned) {
    if (!c.id || c.id === '_template') {
      invalid.push({ dir: c.sourceDir, reason: 'missing or invalid id' });
      continue;
    }
    if (central.has(c.id)) {
      collisions.push(c);
    } else {
      toMigrate.push(c);
    }
  }

  return { toMigrate, collisions, invalid };
}

/** Refuse to operate inside the central repo itself (no-op self-migration). */
export function isSelfMigration(sourceRepo: string, centralRepo: string): boolean {
  return path.resolve(sourceRepo) === path.resolve(centralRepo);
}
