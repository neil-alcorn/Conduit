// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/rules.ts
// description: Sync, list, and install Conduit rules (directives, standards,
//              CLAUDE.md) to/from the remote registry. Mirrors the skill sync
//              pattern so the governance surface (rules) and the tool surface
//              (skills) share the same approval workflow.
// owner:       BOTH
// update:      Manual as rule management behavior changes.
// schema:      none
// last_update: 2026-04-23
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveRepoPath } from '../utils.js';
import { readConduitConfig } from '../internal/config.js';
import { getAgentHostPaths } from '../internal/agent-host.js';

type RuleKind = 'directive' | 'standard' | 'claudemd' | 'conduit_md' | 'highway' | 'other';

interface RuleRecord {
  name: string;
  kind: RuleKind;
  title: string;
  description: string;
  relPath: string;
  content: string;
  contentHash: string;
}

export async function runRules(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit rules <sync|list|install> [args] [--repo path]');
    console.log('');
    console.log('Subcommands:');
    console.log('  sync              Sync all local rules to the registry API');
    console.log('  list              List discovered rules locally');
    console.log('  install           Install approved rules from the registry into ~/.claude/conduit-rules/');
    console.log('');
    console.log('Flags:');
    console.log('  --seed-approved   On sync, mark new rules as approved (one-time bootstrap only)');
    console.log('  --kind <kind>     Filter to a single kind (directive|standard|claudemd|conduit_md|highway)');
    return;
  }

  const subcommand = args[0];
  const { remaining, repoPath } = resolveRepoPath(args.slice(1));
  const seedApproved = remaining.includes('--seed-approved');
  const kindFilter = parseKindFlag(remaining);

  switch (subcommand) {
    case 'list': {
      const rules = collectRules(repoPath, kindFilter);
      if (rules.length === 0) {
        console.log('CONDUIT: no rules found');
        return;
      }
      console.log(`CONDUIT: ${rules.length} rule(s) discovered in ${repoPath}`);
      for (const r of rules) {
        console.log(`  [${r.kind.padEnd(11)}] ${r.relPath} — ${r.title}`);
      }
      return;
    }

    case 'sync': {
      const registryCfg = resolveRegistryConfig(repoPath);
      if (!registryCfg) return;
      const rules = collectRules(repoPath, kindFilter);
      if (rules.length === 0) {
        console.log('CONDUIT: no rules found to sync');
        return;
      }
      console.log(`CONDUIT: syncing ${rules.length} rule(s) to the registry...`);
      await syncRulesToRegistry(rules, registryCfg, seedApproved);
      return;
    }

    case 'install': {
      const registryCfg = resolveRegistryConfig(repoPath);
      if (!registryCfg) return;
      await installRulesFromRegistry(registryCfg);
      return;
    }

    default:
      throw new Error(`unknown rules subcommand: ${subcommand}`);
  }
}

// ── Discovery ────────────────────────────────────────────────────────

/** Walk the conduit repo and build a rule record for each governed file. */
function collectRules(repoPath: string, kindFilter: RuleKind | null): RuleRecord[] {
  const records: RuleRecord[] = [];

  const entries: Array<{ dir: string; kind: RuleKind; exts?: string[] }> = [
    { dir: path.join(repoPath, 'directives'), kind: 'directive', exts: ['.md'] },
    { dir: path.join(repoPath, 'standards'), kind: 'standard', exts: ['.md'] },
    { dir: path.join(repoPath, 'highway-index'), kind: 'highway', exts: ['.yaml', '.yml'] },
  ];

  for (const { dir, kind, exts } of entries) {
    if (!fs.existsSync(dir)) continue;
    walkDir(dir, (full) => {
      const ext = path.extname(full);
      if (exts && !exts.includes(ext)) return;
      const rel = toPosix(path.relative(repoPath, full));
      const content = fs.readFileSync(full, 'utf-8');
      const { title, description } = extractTitleAndDescription(content, path.basename(full));
      records.push({
        name: rel,
        kind,
        title,
        description,
        relPath: rel,
        content,
        contentHash: sha256(content),
      });
    });
  }

  // Top-level governance files
  for (const name of ['CLAUDE.md', 'CONDUIT.md']) {
    const full = path.join(repoPath, name);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, 'utf-8');
    const { title, description } = extractTitleAndDescription(content, name);
    records.push({
      name,
      kind: name === 'CLAUDE.md' ? 'claudemd' : 'conduit_md',
      title: title || name,
      description,
      relPath: name,
      content,
      contentHash: sha256(content),
    });
  }

  return kindFilter ? records.filter((r) => r.kind === kindFilter) : records;
}

function walkDir(dir: string, visit: (filePath: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, visit);
    else if (entry.isFile()) visit(full);
  }
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf-8').digest('hex');
}

function parseKindFlag(args: string[]): RuleKind | null {
  const idx = args.indexOf('--kind');
  if (idx < 0 || idx + 1 >= args.length) return null;
  const v = args[idx + 1];
  const valid: RuleKind[] = ['directive', 'standard', 'claudemd', 'conduit_md', 'highway', 'other'];
  return valid.includes(v as RuleKind) ? (v as RuleKind) : null;
}

/**
 * Extract a human-readable title + one-line description. We prefer (in order):
 *   1. YAML frontmatter `name:` / `description:` (matches the skill convention)
 *   2. The first H1 heading for the title
 *   3. The first non-blank, non-heading paragraph for the description
 *   4. Fall back to the filename
 */
function extractTitleAndDescription(content: string, fallback: string): { title: string; description: string } {
  let title = '';
  let description = '';

  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const rawBody = fm ? fm[2] : content;

  if (fm) {
    const nameM = fm[1].match(/^name:\s*(.+)$/m);
    const descM = fm[1].match(/^description:\s*(.+)$/m);
    if (nameM) title = nameM[1].trim();
    if (descM) description = descM[1].trim();
  }

  // Strip HTML comments before H1/description detection — many directive files
  // start with a <!-- CONDUIT MANAGED FILE --> block whose inner lines begin
  // with "# file:" and look like markdown headers otherwise.
  const body = rawBody.replace(/<!--[\s\S]*?-->/g, '');

  if (!title) {
    const h1 = body.match(/^#\s+(?!#)(.+)$/m);
    if (h1) title = h1[1].trim();
  }
  if (!title) title = fallback;

  if (!description) {
    const lines = body.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#')) continue;
      if (line.startsWith('<!--')) continue;
      if (line.startsWith('```')) continue;
      description = line.slice(0, 240);
      break;
    }
  }

  return { title, description };
}

// ── Registry config (same contract as skill sync) ────────────────────

function resolveRegistryConfig(repoPath: string): { baseUrl: string; apiKey: string } | null {
  let baseUrl = process.env['CONDUIT_REGISTRY_URL'] ?? '';
  let apiKey = process.env['CONDUIT_REGISTRY_API_KEY'] ?? '';

  if (!baseUrl || !apiKey) {
    try {
      const config = readConduitConfig(repoPath);
      if (config.registry) {
        if (!baseUrl && config.registry.api_url) baseUrl = config.registry.api_url;
        if (!apiKey && config.registry.api_key) apiKey = config.registry.api_key;
      }
    } catch {
      // Config file may not exist — that's fine
    }
  }

  if (!baseUrl || !apiKey) {
    console.log('CONDUIT: CONDUIT_REGISTRY_URL and CONDUIT_REGISTRY_API_KEY required for rules sync');
    console.log('  Set these environment variables or configure in .conduit/config.yaml');
    return null;
  }

  return { baseUrl, apiKey };
}

// ── Sync ──────────────────────────────────────────────────────────────

async function syncRulesToRegistry(
  rules: RuleRecord[],
  cfg: { baseUrl: string; apiKey: string },
  seedApproved: boolean,
): Promise<void> {
  const { baseUrl, apiKey } = cfg;
  const ownerEmail = process.env['USER'] || process.env['USERNAME'] || 'unknown';

  let created = 0, updated = 0, unchanged = 0, failed = 0;

  for (const rule of rules) {
    try {
      const payload: Record<string, unknown> = {
        name: rule.name,
        kind: rule.kind,
        title: rule.title,
        description: rule.description,
        path: rule.relPath,
        content: rule.content,
        contentHash: rule.contentHash,
        ownerEmail,
      };
      if (seedApproved) payload.status = 'approved';

      const res = await fetch(`${baseUrl}/api/conduit/rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json() as { action?: string };
        const action = data.action ?? 'synced';
        if (action === 'created') created++;
        else if (action === 'updated') updated++;
        else if (action === 'unchanged') unchanged++;
        console.log(`  ${action.padEnd(9)}: ${rule.name}`);
      } else {
        failed++;
        const err = await res.json().catch(() => ({ error: res.statusText })) as Record<string, unknown>;
        console.log(`  failed   : ${rule.name} — ${err['error'] ?? res.statusText}`);
      }
    } catch (e: unknown) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  failed   : ${rule.name} — ${msg}`);
    }
  }

  console.log('');
  console.log(`CONDUIT: ${created} created, ${updated} updated, ${unchanged} unchanged, ${failed} failed`);
  if (seedApproved) {
    console.log('  (new rules marked approved via --seed-approved — subsequent syncs will require review)');
  }
}

// ── Install — pulls approved rules into ~/.claude/conduit-rules/ ─────

async function installRulesFromRegistry(cfg: { baseUrl: string; apiKey: string }): Promise<void> {
  const { baseUrl, apiKey } = cfg;

  let rules: Array<{ name: string; kind: string; path: string; content: string }>;
  try {
    const res = await fetch(`${baseUrl}/api/conduit/rules?status=approved`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.log(`CONDUIT: failed to fetch rules — ${res.statusText}`);
      return;
    }
    const data = await res.json() as { rules: Array<{ name: string; kind: string; path: string; content: string }> };
    rules = data.rules;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`CONDUIT: failed to fetch rules — ${msg}`);
    return;
  }

  if (!rules || rules.length === 0) {
    console.log('CONDUIT: no approved rules found in the registry');
    return;
  }

  const rulesDir = getAgentHostPaths().rulesDir;
  fs.mkdirSync(rulesDir, { recursive: true });

  let installed = 0;
  for (const rule of rules) {
    // Mirror the repo's relative path under the active host's Conduit rules dir.
    const target = path.join(rulesDir, ...rule.path.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, rule.content, 'utf-8');
    installed++;
  }

  console.log(`CONDUIT: ${installed} rule(s) installed to ${rulesDir}`);
}
