// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/config.ts
// description: Reads .conduit/config.yaml and returns a typed ConduitConfig.
// owner:       BOTH
// update:      Manual when config schema changes.
// schema:      none
// last_update: 2026-04-17
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// Optional remote registry the skill/rules/learn commands sync to.
export interface RegistryConfig {
  api_url: string;
  api_key: string;
}

export interface ConduitConfig {
  developer: {
    name: string;
    email: string;
  };
  registry?: RegistryConfig;
}

export function readConduitConfig(repoPath: string): ConduitConfig {
  const configPath = path.join(repoPath, '.conduit', 'config.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`conduit config not found: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(raw) as Record<string, unknown>;

  const dev = parsed['developer'] as Record<string, unknown> | undefined;
  const registryRaw = parsed['registry'] as Record<string, unknown> | undefined;

  let registry: RegistryConfig | undefined;
  if (registryRaw) {
    const apiUrl = String(registryRaw['api_url'] ?? '');
    const apiKey = String(registryRaw['api_key'] ?? '');
    if (apiUrl) {
      registry = { api_url: apiUrl, api_key: apiKey };
    }
  }

  return {
    developer: {
      name: String(dev?.['name'] ?? ''),
      email: String(dev?.['email'] ?? ''),
    },
    registry,
  };
}
