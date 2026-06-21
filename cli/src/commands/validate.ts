// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/validate.ts
// description: Validation command group for Highway documents, convoy records, and aggregate checks.
// owner:       BOTH
// update:      Manual when validation behavior evolves.
// schema:      highways/repo-signals.schema.yaml
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { parseSignalsFromFile } from '../internal/signals.js';
import { daysSince, STALE_DAYS } from '../internal/staleness.js';

/**
 * Emit a one-line deprecation warning to stderr when convoy.yaml uses the legacy
 * `status: closed` value. Safe to call from any code path that has just read a
 * convoy.yaml — it inspects the raw text and writes nothing on disk.
 *
 * Deprecation window: 3 conduit minor releases — warn → warn → error. The third
 * release replaces this warning with a hard validation error in convoy schema
 * checks.
 */
export function warnIfDeprecatedStatus(yamlContent: string, convoyId: string): void {
  const m = yamlContent.match(/^status:\s*["']?([^"'\s\n]+)["']?/m);
  if (m && m[1] === 'closed') {
    console.warn(`CONDUIT warn: convoy ${convoyId} uses deprecated status 'closed'; reclassify as released or withdrawn (run scripts/migrate-archived-status.ts)`);
  }
}

export function runValidate(args: string[]): void {
  if (args.length === 0) {
    console.log('usage: conduit validate <highway|convoy|registry|all> [args]');
    return;
  }

  switch (args[0]) {
    case 'highway':
      if (args.length !== 2) throw new Error('usage: conduit validate highway [path-to-repo-or-CONDUIT.md]');
      validateHighwayPath(args[1]);
      return;
    case 'convoy':
      if (args.length !== 2) throw new Error('usage: conduit validate convoy [convoy-id]');
      validateConvoy(args[1]);
      return;
    case 'registry':
      validateRegistry();
      return;
    case 'all':
      validateAll();
      return;
    default:
      throw new Error(`unknown validate subcommand: ${args[0]}`);
  }
}

function validateHighwayPath(pathArg: string): void {
  let targetPath = pathArg;
  try {
    if (fs.statSync(pathArg).isDirectory()) {
      targetPath = path.join(pathArg, 'CONDUIT.md');
    }
  } catch { /* not a directory or doesn't exist — use as-is */ }

  console.log(`CONDUIT: Validating highway document at ${targetPath}...`);
  const report = validateHighwayDocument(targetPath);

  let errorCount = 0;
  for (const line of report) {
    console.log(line);
    if (line.startsWith('  x ')) errorCount++;
  }

  if (errorCount > 0) throw new Error(`CONDUIT: Validation FAILED (${errorCount} errors)`);
  console.log('CONDUIT: Validation PASSED');
}

function validateHighwayDocument(targetPath: string): string[] {
  const signals = parseSignalsFromFile(targetPath);
  const report: string[] = [
    `  ok operational_status: ${signals.operational_status}`,
    `  ok system_class: ${signals.system_class}`,
  ];

  if (signals.operational_status === 'ACTIVE') {
    const requiredFields: Record<string, string> = {
      'escalation_contacts.owner':     signals.escalation_contacts.owner,
      'escalation_contacts.architect': signals.escalation_contacts.architect,
      'escalation_contacts.security':  signals.escalation_contacts.security,
      highway_init_date:               signals.highway_init_date,
      last_context_update:             signals.last_context_update,
    };

    for (const [fieldName, value] of Object.entries(requiredFields)) {
      const strVal = value == null ? '' : String(value);
      if (!strVal.trim()) {
        report.push(`  x ${fieldName}: empty - required for ACTIVE repos`);
      } else {
        report.push(`  ok ${fieldName}: ${strVal}`);
      }
    }

    // last_context_update staleness — warn if > STALE_DAYS, not an error
    const age = daysSince(signals.last_context_update);
    if (age > STALE_DAYS) {
      report.push(`  warn last_context_update: ${age} days ago — CONTEXT.md may be stale`);
    } else {
      report.push(`  ok last_context_update: ${age} days ago`);
    }
  }

  // content_signals — optional, but validate values if present
  const cs = signals.content_signals;
  if (cs) {
    const validValues = ['yes', 'no', 'scoped'];
    for (const [field, value] of Object.entries(cs) as [string, string][]) {
      if (validValues.includes(value)) {
        report.push(`  ok content_signals.${field}: ${value}`);
      } else {
        report.push(`  x content_signals.${field}: ${value} - must be yes, no, or scoped`);
      }
    }
  } else {
    report.push(`  info content_signals: not set — defaults to no constraints on agent interaction`);
  }

  return report;
}

interface ConvoyRecord {
  bp_gate_required?: boolean;
}

function validateConvoy(convoyID: string): void {
  const convoyPath = path.join('convoys', 'active', convoyID, 'convoy.yaml');
  console.log(`CONDUIT: Validating convoy record at ${convoyPath}...`);

  const data = fs.readFileSync(convoyPath, 'utf-8');
  warnIfDeprecatedStatus(data, convoyID);
  const record = yaml.load(data) as ConvoyRecord;

  let passed = true;

  // bp_gate_required is a plain optional boolean (default false); validate type only.
  if (record.bp_gate_required !== undefined && typeof record.bp_gate_required !== 'boolean') {
    console.log(`  FAIL bp_gate_required must be a boolean (got ${typeof record.bp_gate_required})`);
    passed = false;
  }

  // Check branch requirement for Stage 3+
  const stageMatch = data.match(/^stage:\s*(\d+)/m);
  const stage = stageMatch ? parseInt(stageMatch[1], 10) : 0;
  if (stage >= 3) {
    // Parse workstreams and check branch fields
    const wsMatches = [...data.matchAll(/^\s+-\s+id:\s*["']?([^"'\n]+)["']?/gm)];
    const branchMatches = [...data.matchAll(/^\s+branch:\s*["']?([^"'\n]*)["']?/gm)];
    for (let i = 0; i < wsMatches.length; i++) {
      const wsId = wsMatches[i][1].trim();
      const branch = branchMatches[i]?.[1]?.trim() ?? '';
      if (!branch) {
        console.log(`  FAIL workstream ${wsId} has no branch set — required before Stage 3`);
        passed = false;
      }
    }
  }

  if (!passed) {
    throw new Error('CONDUIT: Convoy validation FAILED');
  }

  console.log('CONDUIT: Convoy validation PASSED');
}

// ── Registry Consistency Validation ──────────────────────────────────────────
// Checks that registry.yaml matches filesystem reality:
//   1. Every directory in convoys/active/ has a registry active entry
//   2. Every registry active entry has a matching directory in convoys/active/
//   3. Registry stage matches convoy.yaml stage for active convoys
//   4. No active entries point to archived directories
//   5. Archived entries have matching directories in convoys/archive/
function validateRegistry(): void {
  console.log('CONDUIT: Validating registry consistency...');
  const registryPath = path.join('convoys', 'registry.yaml');
  if (!fs.existsSync(registryPath)) {
    throw new Error('CONDUIT: registry.yaml not found');
  }

  const raw = fs.readFileSync(registryPath, 'utf-8');
  const registry = yaml.load(raw) as { convoys: { active: unknown[]; archived: unknown[]; pending?: unknown[] } };
  let errors = 0;
  let warnings = 0;

  // Helper to extract ID from string or object entries
  const entryId = (entry: unknown): string => {
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object' && entry !== null) return (entry as Record<string, unknown>)['id'] as string ?? '';
    return '';
  };

  const registryActiveIds = new Set((registry.convoys.active ?? []).map(entryId).filter(Boolean));
  const registryArchivedIds = new Set((registry.convoys.archived ?? []).map(entryId).filter(Boolean));

  // Scan filesystem for actual active/archived convoy directories
  const activeDir = path.join('convoys', 'active');
  const archiveDir = path.join('convoys', 'archive');
  const fsActiveIds = new Set<string>();
  const fsArchivedIds = new Set<string>();

  if (fs.existsSync(activeDir)) {
    for (const entry of fs.readdirSync(activeDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('_')) fsActiveIds.add(entry.name);
    }
  }
  if (fs.existsSync(archiveDir)) {
    for (const entry of fs.readdirSync(archiveDir, { withFileTypes: true })) {
      if (entry.isDirectory()) fsArchivedIds.add(entry.name);
    }
  }

  // Check 1: Active dirs missing from registry
  for (const id of fsActiveIds) {
    if (!registryActiveIds.has(id)) {
      console.log(`  x MISSING FROM REGISTRY: ${id} exists in convoys/active/ but not in registry.active`);
      errors++;
    }
  }

  // Check 2: Registry active entries with no matching directory
  for (const id of registryActiveIds) {
    if (!fsActiveIds.has(id)) {
      if (fsArchivedIds.has(id)) {
        console.log(`  x LOCATION MISMATCH: ${id} is in registry.active but directory is in convoys/archive/`);
        errors++;
      } else {
        console.log(`  x ORPHAN ENTRY: ${id} is in registry.active but no directory exists`);
        errors++;
      }
    }
  }

  // Check 3: Stage consistency for active convoys
  for (const entry of (registry.convoys.active ?? [])) {
    const id = entryId(entry);
    if (!id || !fsActiveIds.has(id)) continue;
    const registryStage = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>)['stage'] : undefined;
    if (registryStage === undefined) {
      console.log(`  warn MISSING STAGE: ${id} in registry has no stage field`);
      warnings++;
      continue;
    }
    const convoyYaml = path.join(activeDir, id, 'convoy.yaml');
    if (fs.existsSync(convoyYaml)) {
      const content = fs.readFileSync(convoyYaml, 'utf-8');
      const stageMatch = content.match(/^stage:\s*(\d+)/m);
      const fileStage = stageMatch ? parseInt(stageMatch[1], 10) : -1;
      if (fileStage !== registryStage) {
        console.log(`  x STAGE DRIFT: ${id} registry says stage ${registryStage}, convoy.yaml says stage ${fileStage}`);
        errors++;
      } else {
        console.log(`  ok ${id}: stage ${fileStage}`);
      }
    }
  }

  // Check 4: Archived entries without directories
  for (const id of registryArchivedIds) {
    if (!fsArchivedIds.has(id)) {
      console.log(`  warn MISSING DIR: ${id} is in registry.archived but no directory in convoys/archive/`);
      warnings++;
    }
  }

  // Check 5: Archive dirs missing from registry
  for (const id of fsArchivedIds) {
    if (!registryArchivedIds.has(id)) {
      console.log(`  warn UNTRACKED ARCHIVE: ${id} exists in convoys/archive/ but not in registry.archived`);
      warnings++;
    }
  }

  // Check 6: Format violations — bare strings in archived
  for (const entry of (registry.convoys.archived ?? [])) {
    if (typeof entry === 'string') {
      console.log(`  warn FORMAT: archived entry "${entry}" is a bare string — should be {id, path} object`);
      warnings++;
    }
  }

  console.log(`CONDUIT: Registry validation complete. Errors: ${errors}  Warnings: ${warnings}`);
  if (errors > 0) throw new Error(`CONDUIT: Registry validation FAILED (${errors} errors)`);
}

interface HighwayIndex {
  highway_index: { repos: Array<{ slug: string }> };
}

function validateAll(): void {
  console.log('CONDUIT: Running full validation...');
  let passed = 0;
  let failed = 0;

  try {
    const indexData = fs.readFileSync(path.join('highway-index', 'index.yaml'), 'utf-8');
    const index = yaml.load(indexData) as HighwayIndex;
    for (const repoEntry of index.highway_index.repos) {
      const targetPath = repoEntry.slug === 'conduit'
        ? 'CONDUIT.md'
        : path.join(repoEntry.slug, 'CONDUIT.md');

      if (!fs.existsSync(targetPath)) {
        console.log(`CONDUIT: Skipping highway validation for ${repoEntry.slug} (not present locally)`);
        continue;
      }

      try {
        validateHighwayPath(targetPath);
        passed++;
      } catch (err) {
        console.log((err as Error).message);
        failed++;
      }
    }
  } catch { /* index.yaml missing — skip highway validation */ }

  try {
    const activeConvoys = fs.readdirSync(path.join('convoys', 'active'), { withFileTypes: true });
    for (const entry of activeConvoys) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      try {
        validateConvoy(entry.name);
        passed++;
      } catch (err) {
        console.log((err as Error).message);
        failed++;
      }
    }
  } catch { /* convoys/active missing — skip */ }

  // Registry consistency check
  try {
    validateRegistry();
    passed++;
  } catch (err) {
    console.log((err as Error).message);
    failed++;
  }

  console.log(`CONDUIT: Validation complete. Passed: ${passed} Failed: ${failed}`);
  if (failed > 0) throw new Error('CONDUIT: validation failed');
}
