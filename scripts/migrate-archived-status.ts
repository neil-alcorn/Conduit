// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        scripts/migrate-archived-status.ts
// description: One-time migration — backfills `status: released` on archived convoys whose
//              convoy.yaml predates the released/withdrawn vocabulary.
//              Idempotent. --dry-run prints proposed changes without touching disk or git.
//              Default-released; convoys that should be withdrawn require a manual follow-up commit.
// owner:       BOTH
// update:      Retire after the deprecation window for legacy `status: closed` ends (3 minor releases).
// schema:      convoys/schema/convoy.schema.json
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';

interface MigrationOptions {
  repoPath: string;
  dryRun: boolean;
  push: boolean;
  noCommit: boolean;
}

interface PerConvoyResult {
  id: string;
  before: string;
  after: string;
  action: 'migrate' | 'skip-released' | 'skip-withdrawn';
}

function parseArgs(argv: string[]): MigrationOptions {
  let repoPath = process.cwd();
  let dryRun = false;
  let push = false;
  let noCommit = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--push') push = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--repo') {
      if (i + 1 >= argv.length) throw new Error('missing value for --repo');
      repoPath = path.resolve(argv[++i]);
    } else if (a === '--help' || a === '-h') {
      console.log('usage: node dist/scripts/migrate-archived-status.js [--repo <path>] [--dry-run] [--no-commit] [--push]');
      console.log('  Backfills status=released on archived convoys missing a terminal status.');
      console.log('  Idempotent. Re-running is a no-op once everything is migrated.');
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return { repoPath, dryRun, push, noCommit };
}

function readStatus(yamlContent: string): string | null {
  const m = yamlContent.match(/^status:\s*["']?([^"'\s\n]+)["']?/m);
  return m ? m[1] : null;
}

function rewriteStatus(yamlContent: string, newStatus: string, today: string): string {
  if (readStatus(yamlContent) === null) {
    // No status line — append at the end of the YAML body, before any trailing newline noise
    const trimmed = yamlContent.endsWith('\n') ? yamlContent : yamlContent + '\n';
    return trimmed + `status: ${newStatus}\n`;
  }
  return yamlContent
    .replace(/^(status:\s*)["']?[^"'\s\n]+["']?/m, `$1${newStatus}`)
    .replace(/^(# last_update:\s*)\S+/m, `$1${today}`);
}

interface ArchivedRegistryEntry {
  id: string;
  path?: string;
  status?: string;
  released_at?: string;
  withdrawn_at?: string;
  withdrawn_reason?: string;
}

interface RegistryShape {
  convoys: {
    active?: unknown[];
    archived?: (string | ArchivedRegistryEntry)[];
    pending?: unknown[];
  };
}

function migrateRegistry(repoPath: string, results: PerConvoyResult[], dryRun: boolean): { changed: boolean } {
  const registryPath = path.join(repoPath, 'convoys', 'registry.yaml');
  if (!fs.existsSync(registryPath)) return { changed: false };

  const raw = fs.readFileSync(registryPath, 'utf-8');
  const registry = yaml.load(raw) as RegistryShape;
  const archived = registry.convoys?.archived ?? [];

  let changed = false;
  const migratedIds = new Set(results.filter(r => r.action === 'migrate').map(r => r.id));

  const newArchived = archived.map(entry => {
    if (typeof entry === 'string') {
      // Bare string entry — convert to object form on a status migration to record terminal state
      if (migratedIds.has(entry)) {
        changed = true;
        return { id: entry, path: `convoys/archive/${entry}/`, status: 'released' };
      }
      return entry;
    }
    if (typeof entry === 'object' && entry !== null) {
      const e = entry as ArchivedRegistryEntry;
      if (migratedIds.has(e.id) && (e.status === 'closed' || e.status === undefined || e.status === null)) {
        changed = true;
        return { ...e, status: 'released' };
      }
      return e;
    }
    return entry;
  });

  if (changed && !dryRun) {
    registry.convoys = { ...registry.convoys, archived: newArchived };
    const header = `# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        convoys/registry.yaml
# description: Master registry of active and archived convoys known to the local orchestration repo.
# owner:       BOTH
# update:      On convoy creation, archive, and status changes.
# schema:      convoys/schema/convoy.schema.json
# last_update: ${new Date().toISOString().slice(0, 10)}
# ─────────────────────────────────────────────────────────────────────
`;
    fs.writeFileSync(registryPath, header + yaml.dump(registry), 'utf-8');
  }

  return { changed };
}

function gitCommit(repoPath: string, files: string[], message: string, push: boolean): boolean {
  try {
    for (const f of files) {
      try { execSync(`git add "${f}"`, { cwd: repoPath, stdio: 'pipe' }); } catch { /* tolerate missing files */ }
    }
    try {
      execSync('git diff --cached --quiet', { cwd: repoPath, stdio: 'pipe' });
      // No staged changes — nothing to commit
      return false;
    } catch {
      // Has changes — proceed
    }
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: repoPath, stdio: 'pipe' });
    if (push) {
      try { execSync('git push', { cwd: repoPath, stdio: 'pipe' }); } catch { /* leave for operator */ }
    }
    return true;
  } catch (e) {
    const msg = (e as Error).message;
    console.warn(`git commit failed: ${msg.split('\n')[0]}`);
    return false;
  }
}

export interface MigrationSummary {
  results: PerConvoyResult[];
  changedConvoys: string[];
  registryChanged: boolean;
  committed: boolean;
  logPath?: string;
}

export function runMigration(opts: MigrationOptions): MigrationSummary {
  const archiveDir = path.join(opts.repoPath, 'convoys', 'archive');
  if (!fs.existsSync(archiveDir)) {
    console.log(`no archive directory found at ${archiveDir} — nothing to migrate`);
    return { results: [], changedConvoys: [], registryChanged: false, committed: false };
  }

  const today = new Date().toISOString().slice(0, 10);
  const entries = fs.readdirSync(archiveDir, { withFileTypes: true });
  const results: PerConvoyResult[] = [];
  const changedFiles: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const yamlPath = path.join(archiveDir, entry.name, 'convoy.yaml');
    if (!fs.existsSync(yamlPath)) continue;

    const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
    const before = readStatus(yamlContent);

    if (before === 'released') {
      results.push({ id: entry.name, before: 'released', after: 'released', action: 'skip-released' });
      continue;
    }
    if (before === 'withdrawn') {
      results.push({ id: entry.name, before: 'withdrawn', after: 'withdrawn', action: 'skip-withdrawn' });
      continue;
    }

    // status === 'closed' or any other / missing → backfill to 'released'
    const newContent = rewriteStatus(yamlContent, 'released', today);
    if (!opts.dryRun) {
      fs.writeFileSync(yamlPath, newContent, 'utf-8');
      changedFiles.push(path.relative(opts.repoPath, yamlPath).replace(/\\/g, '/'));
    }
    results.push({ id: entry.name, before: before ?? '(missing)', after: 'released', action: 'migrate' });
  }

  // Registry update
  const { changed: registryChanged } = migrateRegistry(opts.repoPath, results, opts.dryRun);
  if (registryChanged && !opts.dryRun) {
    changedFiles.push('convoys/registry.yaml');
  }

  // Per-run log
  let logPath: string | undefined;
  if (!opts.dryRun) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    logPath = path.join(opts.repoPath, 'scripts', `migrate-archived-status-${ts}.log`);
    const lines = [
      `migrate-archived-status run at ${new Date().toISOString()}`,
      `repo: ${opts.repoPath}`,
      `total scanned: ${results.length}`,
      `migrated: ${results.filter(r => r.action === 'migrate').length}`,
      `skipped (already released): ${results.filter(r => r.action === 'skip-released').length}`,
      `skipped (already withdrawn): ${results.filter(r => r.action === 'skip-withdrawn').length}`,
      ``,
      `Per-convoy outcomes:`,
      ...results.map(r => `  ${r.id.padEnd(40)} ${r.before.padEnd(12)} → ${r.after.padEnd(12)}  [${r.action}]`),
    ];
    fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf-8');
  }

  // Commit
  let committed = false;
  if (!opts.dryRun && !opts.noCommit && changedFiles.length > 0) {
    committed = gitCommit(
      opts.repoPath,
      changedFiles,
      'migrate: backfill archived convoy status as released',
      opts.push,
    );
  }

  return {
    results,
    changedConvoys: results.filter(r => r.action === 'migrate').map(r => r.id),
    registryChanged,
    committed,
    logPath,
  };
}

function printSummary(summary: MigrationSummary, opts: MigrationOptions): void {
  const banner = opts.dryRun
    ? '━━━━━━━ DRY RUN — no files or git changes ━━━━━━━'
    : '━━━━━━━ migrate-archived-status — applied ━━━━━━━';
  console.log(banner);
  console.log(`Total archived convoys scanned: ${summary.results.length}`);
  console.log(`  Migrated to released:   ${summary.results.filter(r => r.action === 'migrate').length}`);
  console.log(`  Already released:        ${summary.results.filter(r => r.action === 'skip-released').length}`);
  console.log(`  Already withdrawn:       ${summary.results.filter(r => r.action === 'skip-withdrawn').length}`);
  console.log('');
  for (const r of summary.results) {
    const tag = r.action === 'migrate' ? '  MIGRATE  ' : r.action === 'skip-released' ? '  ok       ' : '  ok-w     ';
    console.log(`${tag}${r.id.padEnd(42)}${r.before.padEnd(12)} → ${r.after}`);
  }
  console.log('');
  if (summary.registryChanged) console.log('  registry.yaml: archived entries updated');
  if (summary.logPath)         console.log(`  log: ${summary.logPath}`);
  if (summary.committed)       console.log('  git: single commit created — review before pushing if --push was not set');
  if (opts.dryRun) {
    console.log('');
    console.log('To apply, re-run without --dry-run.');
  }
}

// CLI entry — when this file is invoked via `node dist/scripts/migrate-archived-status.js`,
// process.argv[1] basename matches; when imported from a test it does not.
const isMain = path.basename(process.argv[1] ?? '') === 'migrate-archived-status.js';

if (isMain) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const summary = runMigration(opts);
    printSummary(summary, opts);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
