// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/migrate-stray-registry.ts
// description: One-shot operator command (CLI-4 / AC-20) that relocates a
//              stray convoy registry from a target repo into the central
//              conduit repo. Validates schema, detects id collisions,
//              cpSync-copies non-colliding convoys, appends central registry
//              entries, deletes source convoys/, writes a stub README, and
//              emits one explicit-pathspec commit per repo.
//              Defect #4 (Stage 2): runGit migrated from
//              execSync(`"${gitBin()}" ...`) shell-string form to
//              execFileSync(gitBin(), [argv]). Pathspecs and commit
//              messages are now argv elements — no shell quoting needed.
// owner:       BOTH
// update:      Manual when migrate-stray-registry contract changes.
// schema:      none
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { resolveConvoyRoot } from '../utils.js';
import { buildMigrationPlan, isSelfMigration, type ScannedConvoy } from '../internal/migrate.js';

function gitBin(): string {
  return process.env.GIT_PATH || 'git';
}

function runGit(repo: string, args: string[]): string {
  return execFileSync(gitBin(), args, { cwd: repo, stdio: 'pipe', timeout: 15000 }).toString().trim();
}

function isClean(repo: string): boolean {
  try {
    return runGit(repo, ['status', '--porcelain']).length === 0;
  } catch {
    return true; // not a git repo — treat as clean
  }
}

function commitPathspecs(repo: string, paths: string[], message: string): void {
  for (const p of paths) {
    runGit(repo, ['add', '--', p]);
  }
  runGit(repo, ['commit', '-m', message]);
}

const STUB_README = (centralRepo: string): string =>
  `<!-- CONDUIT MANAGED FILE | last_update: ${new Date().toISOString().slice(0, 10)} -->

# Convoys

This repo's convoy state was migrated to central conduit storage on
${new Date().toISOString().slice(0, 10)} by \`conduit migrate-stray-registry\`.

All convoys for this repo now live in the central conduit repo:

\`\`\`
${centralRepo}
\`\`\`

Use \`conduit context\` from anywhere to see the operating picture.
Convoys are no longer created in this repo. Run \`conduit init --target\`
if you need to refresh the CONDUIT.md marker.
`;

export async function runMigrateStrayRegistry(args: string[]): Promise<void> {
  if (args.length === 0 || args.includes('--help') || args.includes('help')) {
    console.log('usage: conduit migrate-stray-registry <source-repo-path> [--dry-run]');
    console.log('');
    console.log('Relocates a stray convoy registry from a target repo into the central');
    console.log('conduit repo. The source repo must have convoys/registry.yaml; if not,');
    console.log('exits 0 with "no stray registry to migrate."');
    console.log('');
    console.log('Steps (per AC-20):');
    console.log('  1. Refuse if source==central or either repo has uncommitted changes');
    console.log('  2. Scan source convoys/active and convoys/archive for valid convoys');
    console.log('  3. Check for id collisions in central — refuses to overwrite');
    console.log('  4. fs.cpSync each non-colliding convoy directory into central');
    console.log('  5. Append registry entries to central convoys/registry.yaml');
    console.log('  6. Delete source convoys/active|archive/<id>/ and source registry');
    console.log('  7. Write stub <source>/convoys/README.md pointing at central');
    console.log('  8. Emit one commit per repo with explicit pathspec staging');
    console.log('');
    console.log('Flags:');
    console.log('  --dry-run    Print what would happen without modifying anything');
    console.log('');
    console.log('Exit codes: 0 success / no work, 1 failure, 2 collision (operator must resolve)');
    return;
  }

  const dryRun = args.includes('--dry-run');
  const positional = args.filter(a => !a.startsWith('--'));
  if (positional.length !== 1) {
    throw new Error('usage: conduit migrate-stray-registry <source-repo-path> [--dry-run]');
  }
  const sourceRepo = path.resolve(positional[0]);
  if (!fs.existsSync(sourceRepo)) throw new Error(`path not found: ${sourceRepo}`);

  const sourceRegistry = path.join(sourceRepo, 'convoys', 'registry.yaml');
  if (!fs.existsSync(sourceRegistry)) {
    console.log(`CONDUIT: no stray registry at ${sourceRegistry} — nothing to migrate.`);
    return;
  }

  const central = resolveConvoyRoot();
  if (isSelfMigration(sourceRepo, central)) {
    throw new Error(`refusing to migrate central into itself (source=${sourceRepo}, central=${central})`);
  }

  if (!fs.existsSync(path.join(central, 'convoys', 'registry.yaml'))) {
    throw new Error(`central registry missing at ${central} — run \`conduit init --global ${central}\` first`);
  }

  if (!isClean(sourceRepo)) throw new Error(`source repo has uncommitted changes — commit or stash first: ${sourceRepo}`);
  if (!isClean(central)) throw new Error(`central repo has uncommitted changes — commit or stash first: ${central}`);

  const plan = buildMigrationPlan(sourceRepo, central);

  console.log('━'.repeat(62));
  console.log(`CONDUIT MIGRATE-STRAY-REGISTRY${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Source:  ${sourceRepo}`);
  console.log(`Central: ${central}`);
  console.log('━'.repeat(62));
  console.log(`  Plan: ${plan.toMigrate.length} to migrate, ${plan.collisions.length} collisions, ${plan.invalid.length} invalid`);

  if (plan.collisions.length > 0) {
    console.error('CONDUIT: id collisions detected — refusing to overwrite. Operator must rename or merge:');
    for (const c of plan.collisions) {
      console.error(`  - ${c.id} (${c.bucket}/) at ${c.sourceDir}`);
    }
    process.exitCode = 2;
    return;
  }

  if (dryRun) {
    for (const c of plan.toMigrate) {
      console.log(`  WOULD migrate: ${c.bucket}/${c.id}`);
    }
    return;
  }

  // ── Phase 1: copy each convoy into central ──
  const copiedPathspecs: string[] = [];
  for (const c of plan.toMigrate) {
    const dest = path.join(central, 'convoys', c.bucket, c.id);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(c.sourceDir, dest, { recursive: true });
    copiedPathspecs.push(`convoys/${c.bucket}/${c.id}`);
    console.log(`  migrated: ${c.bucket}/${c.id}`);
  }

  // ── Phase 2: append central registry entries ──
  const centralRegistry = path.join(central, 'convoys', 'registry.yaml');
  const reg = yaml.load(fs.readFileSync(centralRegistry, 'utf-8')) as { convoys?: Record<string, { stage: number }> };
  reg.convoys = reg.convoys ?? {};
  for (const c of plan.toMigrate) {
    if (c.bucket === 'active') {
      reg.convoys[c.id] = { stage: 0 }; // stage will be refreshed by `conduit sync` next time
    }
  }
  fs.writeFileSync(centralRegistry, yaml.dump(reg), 'utf-8');
  copiedPathspecs.push('convoys/registry.yaml');

  // ── Phase 3: commit central side BEFORE deleting source (safety per AC-20 ordering) ──
  commitPathspecs(central, copiedPathspecs, `migrate(stray-registry): import ${plan.toMigrate.length} convoy(s) from ${path.basename(sourceRepo)}`);

  // ── Phase 4: delete source convoys + write stub README ──
  const sourcePathspecs: string[] = [];
  for (const c of plan.toMigrate) {
    fs.rmSync(c.sourceDir, { recursive: true, force: true });
    sourcePathspecs.push(`convoys/${c.bucket}/${c.id}`);
  }
  fs.rmSync(sourceRegistry, { force: true });
  sourcePathspecs.push('convoys/registry.yaml');

  const stubPath = path.join(sourceRepo, 'convoys', 'README.md');
  fs.mkdirSync(path.dirname(stubPath), { recursive: true });
  fs.writeFileSync(stubPath, STUB_README(central), 'utf-8');
  sourcePathspecs.push('convoys/README.md');

  commitPathspecs(sourceRepo, sourcePathspecs, `migrate(stray-registry): relocate convoy state to central conduit repo`);

  console.log(`CONDUIT: migrated ${plan.toMigrate.length} convoy(s). Stub README written to source.`);
}
