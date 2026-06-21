// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/conduit-config.ts
// description: Read/write helpers for the per-developer ~/.conduit/config.json
//              that holds the central conduit repo path and per-repo absolute
//              paths used by CLI-4's central-only resolveConvoyRoot. Atomic
//              writes via temp + rename; cached reads. Missing file and
//              malformed JSON are non-fatal — callers fall through to env
//              vars or surface ConduitNotInitializedError.
// owner:       BOTH
// update:      Manual when conduit-config schema changes.
// schema:      none
// last_update: 2026-06-15
// ─────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ConduitConfig {
  central?: string;
  repos?: Record<string, string>;
}

let _cached: { path: string; mtime: number; data: ConduitConfig } | null = null;

export function configPath(): string {
  if (process.env.CONDUIT_CONFIG_PATH) return process.env.CONDUIT_CONFIG_PATH;
  return path.join(os.homedir(), '.conduit', 'config.json');
}

/**
 * Read the per-developer config. Returns an empty config if the file does
 * not exist OR if the JSON is malformed (warning logged once). Never throws.
 */
export function readConfig(): ConduitConfig {
  const p = configPath();
  if (!fs.existsSync(p)) return {};
  try {
    const stat = fs.statSync(p);
    if (_cached && _cached.path === p && _cached.mtime === stat.mtimeMs) {
      return _cached.data;
    }
    const raw = fs.readFileSync(p, 'utf-8');
    const data = JSON.parse(raw) as ConduitConfig;
    _cached = { path: p, mtime: stat.mtimeMs, data };
    return data;
  } catch (err: any) {
    console.warn(`CONDUIT warn: ${p} is unreadable (${err.message ?? 'unknown'}) — ignoring`);
    return {};
  }
}

/**
 * Atomic write: stage to a temp file in the same directory, then rename
 * over the destination. Crash-safe — readers either see the old version or
 * the new version, never a partial write.
 */
export function writeConfig(config: ConduitConfig): void {
  const p = configPath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.config.json.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, p);
  _cached = null;
}

/**
 * Idempotent update: merge a single repo entry into config.repos. Used by
 * `conduit convoy new` to record the target repo's absolute path the first
 * time a convoy is created against it.
 */
export function upsertRepoEntry(name: string, absPath: string): void {
  const config = readConfig();
  config.repos = config.repos ?? {};
  if (config.repos[name] === absPath) return; // idempotent — already correct
  config.repos[name] = absPath;
  writeConfig(config);
}

export function clearConfigCache(): void {
  _cached = null;
}

export interface AutoRegisterResult {
  registered: boolean;
  name?: string;
  path?: string;
  mismatch?: { existing: string; current: string };
}

/**
 * Detect the CWD's git toplevel; if it has a CONDUIT.md, register it in
 * config.repos under its basename. Warns when the stored path for a known
 * name differs from the current git toplevel. Never throws — callers must
 * not be blocked by registration failures.
 */
export function autoRegisterCwdRepo(startPath?: string): AutoRegisterResult {
  try {
    const cwd = startPath ?? process.cwd();
    const gitTop = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim().replace(/\\/g, '/');

    if (!gitTop || !fs.existsSync(path.join(gitTop, 'CONDUIT.md'))) {
      return { registered: false };
    }

    const name = path.basename(gitTop);
    const normalized = path.resolve(gitTop).replace(/\\/g, '/');

    const config = readConfig();
    const existing = config.repos?.[name];

    if (existing && existing !== normalized) {
      console.warn(
        `CONDUIT warn: repo '${name}' is registered at ${existing} but CWD resolves to ${normalized}. ` +
        `Updating config to use ${normalized}.`
      );
      upsertRepoEntry(name, normalized);
      return { registered: true, name, path: normalized, mismatch: { existing, current: normalized } };
    }

    upsertRepoEntry(name, normalized);
    return { registered: true, name, path: normalized };
  } catch {
    return { registered: false };
  }
}
