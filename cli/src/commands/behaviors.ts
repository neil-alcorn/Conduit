// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/behaviors.ts
// description: Behaviors command — show and set configurable CLI policies.
// owner:       BOTH
// update:      When behavior schema changes.
// schema:      none
// last_update: 2026-04-17
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { resolveRepoPath, resolveConvoyRoot } from '../utils.js';
import { loadBehaviors, clearBehaviorCache, type Behaviors } from '../internal/behaviors.js';

export async function runBehaviors(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit behaviors <show|set> [args]');
    console.log('  show                          — display current behavior config');
    console.log('  set <section.key> <value>     — update a single behavior value');
    return;
  }

  const subcommand = args[0];

  switch (subcommand) {
    case 'show': {
      const { repoPath } = resolveRepoPath(args.slice(1));
      const convoyRepoPath = resolveConvoyRoot(repoPath);
      clearBehaviorCache();
      const behaviors = loadBehaviors(convoyRepoPath);
      const RULE = '━'.repeat(62);
      console.log(RULE);
      console.log('CONDUIT BEHAVIOR ENGINE — Current Configuration');
      console.log(RULE);
      console.log(`  version: ${behaviors.version}`);
      console.log('');
      printSection('convoy_create', behaviors.convoy_create);
      printSection('gate_approve', behaviors.gate_approve);
      printSection('convoy_close', behaviors.convoy_close);
      printSection('checkpoint', behaviors.checkpoint);
      printSection('usage', behaviors.usage);
      printSection('context', behaviors.context);
      printSection('skills', behaviors.skills);
      printSection('sync', behaviors.sync);
      console.log(RULE);
      console.log('  Edit: behaviors.yaml in repo root');
      console.log('  Set:  conduit behaviors set <section.key> <value>');
      return;
    }

    case 'set': {
      const rest = args.slice(1);
      if (rest.length < 2) {
        throw new Error('usage: conduit behaviors set <section.key> <value>\n  Example: conduit behaviors set gate_approve.auto_push false');
      }
      const dottedKey = rest[0];
      const rawValue = rest.slice(1).join(' ');
      const parts = dottedKey.split('.');
      if (parts.length !== 2) {
        throw new Error(`invalid key "${dottedKey}" — must be section.key (e.g., gate_approve.auto_push)`);
      }
      const [section, key] = parts;

      const { repoPath } = resolveRepoPath(rest.slice(2));
      const convoyRepoPath = resolveConvoyRoot(repoPath);
      const filePath = path.join(convoyRepoPath, 'behaviors.yaml');

      if (!fs.existsSync(filePath)) {
        throw new Error(`behaviors.yaml not found at ${filePath} — run from the conduit repo root`);
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(raw) as Record<string, unknown>;

      if (!(section in parsed) || typeof parsed[section] !== 'object' || parsed[section] === null) {
        throw new Error(`unknown section "${section}" — valid sections: convoy_create, gate_approve, convoy_close, checkpoint, usage, context, skills, sync`);
      }

      const sectionObj = parsed[section] as Record<string, unknown>;
      if (!(key in sectionObj)) {
        throw new Error(`unknown key "${key}" in section "${section}" — valid keys: ${Object.keys(sectionObj).join(', ')}`);
      }

      // Parse the value
      let value: unknown;
      if (rawValue === 'true') value = true;
      else if (rawValue === 'false') value = false;
      else if (!isNaN(Number(rawValue))) value = Number(rawValue);
      else value = rawValue;

      const oldValue = sectionObj[key];
      sectionObj[key] = value;

      // Preserve the header comments by writing them back
      const headerEnd = raw.indexOf('\nversion:');
      const header = headerEnd >= 0 ? raw.slice(0, headerEnd + 1) : '';
      const yamlBody = yaml.dump(parsed, { lineWidth: -1, noRefs: true, sortKeys: false });
      fs.writeFileSync(filePath, header + yamlBody, 'utf-8');

      // Clear cache so next load picks up the change
      clearBehaviorCache();

      console.log(`CONDUIT: ${dottedKey} updated: ${String(oldValue)} → ${String(value)}`);
      return;
    }

    default:
      throw new Error(`unknown behaviors subcommand: ${subcommand} — use show or set`);
  }
}

function printSection(name: string, obj: Record<string, unknown>): void {
  console.log(`  ${name}:`);
  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      console.log(`    ${key}: [${val.join(', ')}]`);
    } else {
      console.log(`    ${key}: ${String(val)}`);
    }
  }
  console.log('');
}
