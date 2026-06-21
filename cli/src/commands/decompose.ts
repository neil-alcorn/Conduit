// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/decompose.ts
// description: Unified requirements decomposition — generate, lint, review, approve, apply.
//              Plan + lint + apply for breaking work items into workstreams and tasks.
// owner:       BOTH
// update:      Manual as decomposition behavior changes.
// schema:      none
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveRepoPath, resolveConvoyRoot, parseFlagValue, currentActor, todayISO } from '../utils.js';
import { checkPermission } from '../internal/signals.js';
import { sanitize } from '../internal/sanitizer.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';
import { agentName } from '../internal/agent-name.js';

// ── Types ──────────────────────────────────────────────────────────

type SuggestionType = 'create_epic' | 'create_feature' | 'create_story';
type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type LintSeverity = 'error' | 'warn';

interface ProposedFields {
  title: string;
  description?: string;
  acceptance_criteria?: string;
  story_points?: number;
  clarity?: number;       // 1=Fully Defined, 2=Partially Defined, 3=Ambiguous
  complexity?: number;    // 1=Straightforward, 2=Moderate, 3=Complex
  area_path?: string;
  iteration_path?: string;
  tags: string[];
  audience_type?: string;
}

interface Suggestion {
  id: string;
  type: SuggestionType;
  parent_id?: string;      // SUG-NNN of parent (feature → epic, story → feature)
  proposed_fields: ProposedFields;
  fingerprint: string;
  approval: ApprovalStatus;
  rationale: string;
}

interface LintFinding {
  rule_id: string;
  severity: LintSeverity;
  suggestion_id: string;
  message: string;
}

interface DecomposeArtifact {
  id: string;
  convoy_id: string;
  board: string;
  created_at: string;
  created_by: string;
  source: string;          // living-spec, requirements file, or manual
  suggestions: Suggestion[];
  lint_findings: LintFinding[];
  applied_at?: string;
}

// ── Story Points Matrix ────────────────────────────────────────────

const POINTS_MATRIX: Record<string, number> = {
  '1-1': 1, '1-2': 3, '1-3': 5,
  '2-1': 2, '2-2': 5, '2-3': 8,
  '3-1': 3, '3-2': 8, '3-3': 13,
};

function deriveStoryPoints(clarity: number, complexity: number): number {
  const key = `${clarity}-${complexity}`;
  return POINTS_MATRIX[key] ?? 5;
}

// ── Helpers ────────────────────────────────────────────────────────

function fingerprint(obj: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

function findActiveConvoy(repoPath: string, convoyId?: string): { id: string; root: string } {
  const resolved = resolveConvoyRoot(repoPath);
  if (convoyId) {
    const root = path.join(resolved, 'convoys', 'active', convoyId);
    if (!fs.existsSync(root)) throw new Error(`convoy ${convoyId} not found`);
    return { id: convoyId, root };
  }
  const activeDir = path.join(resolved, 'convoys', 'active');
  if (!fs.existsSync(activeDir)) throw new Error('no convoys directory found');
  const dirs = fs.readdirSync(activeDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template');
  if (dirs.length === 0) throw new Error('no active convoy found');
  if (dirs.length > 1) throw new Error(`multiple active convoys — specify: ${dirs.map(d => d.name).join(', ')}`);
  return { id: dirs[0].name, root: path.join(activeDir, dirs[0].name) };
}

function loadArtifact(convoyRoot: string): DecomposeArtifact | null {
  const auditDir = path.join(convoyRoot, 'audit');
  if (!fs.existsSync(auditDir)) return null;
  const files = fs.readdirSync(auditDir).filter(f => f.startsWith('decompose-') && f.endsWith('.json')).sort().reverse();
  if (files.length === 0) return null;
  return JSON.parse(fs.readFileSync(path.join(auditDir, files[0]), 'utf-8')) as DecomposeArtifact;
}

function saveArtifact(convoyRoot: string, artifact: DecomposeArtifact): string {
  const auditDir = path.join(convoyRoot, 'audit');
  fs.mkdirSync(auditDir, { recursive: true });
  const filename = `decompose-${artifact.id}.json`;
  const filepath = path.join(auditDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(artifact, null, 2), 'utf-8');
  return filepath;
}

function readConvoyField(convoyRoot: string, field: string): string {
  const yamlPath = path.join(convoyRoot, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) return '';
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const match = content.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : '';
}

// Parse workstream repo slugs from convoy.yaml
function parseWorkstreamRepos(convoyRoot: string): string[] {
  const yamlPath = path.join(convoyRoot, 'convoy.yaml');
  if (!fs.existsSync(yamlPath)) return [];
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const matches = content.match(/repo_slug:\s*["']?([^"'\n]+)["']?/g) ?? [];
  return matches.map(m => m.replace(/repo_slug:\s*["']?/, '').replace(/["']?$/, '').trim());
}

// ── Lint Rules ─────────────────────────────────────────────────────

function lintSuggestions(suggestions: Suggestion[]): LintFinding[] {
  const findings: LintFinding[] = [];
  const VALID_POINTS = new Set([1, 2, 3, 5, 8, 13]);

  for (const s of suggestions) {
    if (s.type !== 'create_story') continue;
    const f = s.proposed_fields;

    // Rule 1: REQUIRED_FIELDS
    if (f.story_points === undefined || f.story_points === null) {
      findings.push({ rule_id: 'REQUIRED_FIELDS', severity: 'error', suggestion_id: s.id, message: `${s.id}: StoryPoints is missing` });
    }
    if (f.clarity === undefined) {
      findings.push({ rule_id: 'REQUIRED_FIELDS', severity: 'error', suggestion_id: s.id, message: `${s.id}: Clarity is missing` });
    }
    if (f.complexity === undefined) {
      findings.push({ rule_id: 'REQUIRED_FIELDS', severity: 'error', suggestion_id: s.id, message: `${s.id}: Complexity is missing` });
    }

    // Rule 2: INVALID_POINTS
    if (f.story_points !== undefined && !VALID_POINTS.has(f.story_points)) {
      findings.push({ rule_id: 'INVALID_POINTS', severity: 'error', suggestion_id: s.id, message: `${s.id}: StoryPoints ${f.story_points} not in {1,2,3,5,8,13}` });
    }

    // Rule 3: OVERSIZE_POINTS
    if (f.story_points === 13) {
      findings.push({ rule_id: 'OVERSIZE_POINTS', severity: 'warn', suggestion_id: s.id, message: `${s.id}: StoryPoints = 13 — consider splitting` });
    }

    // Rule 4: MISSING_AC
    if (!f.acceptance_criteria || f.acceptance_criteria.trim().length === 0) {
      findings.push({ rule_id: 'MISSING_AC', severity: 'warn', suggestion_id: s.id, message: `${s.id}: Acceptance Criteria missing` });
    }

    // Rule 5: AMBIGUOUS_UNKNOWNS
    if (f.clarity === 3) {
      const desc = (f.description ?? '') + (f.acceptance_criteria ?? '');
      if (!/unknowns|open questions|assumptions/i.test(desc)) {
        findings.push({ rule_id: 'AMBIGUOUS_UNKNOWNS', severity: 'error', suggestion_id: s.id, message: `${s.id}: Clarity=Ambiguous but no Unknowns/Open Questions section` });
      }
    }

    // Rule 6: COMPLEX_TESTING
    if (f.complexity === 3) {
      const desc = (f.description ?? '') + (f.acceptance_criteria ?? '');
      if (!/testing|validation|test plan/i.test(desc)) {
        findings.push({ rule_id: 'COMPLEX_TESTING', severity: 'warn', suggestion_id: s.id, message: `${s.id}: Complexity=Complex but no Testing/Validation section` });
      }
    }
  }

  return findings;
}

// ── Main Command ───────────────────────────────────────────────────

export async function runDecompose(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit decompose <generate|lint|review|approve|apply|status> [convoy-id] [--repo path]');
    console.log('');
    console.log('Unified requirements decomposition — generate, lint, review, approve, apply.');
    console.log('');
    console.log('Subcommands:');
    console.log('  generate    Create Epic/Feature/Story from requirements (stages locally)');
    console.log('  lint        Run 6 quality rules against staged suggestions');
    console.log('  review      Show staged suggestions with approval status');
    console.log('  approve     Mark suggestion(s) as approved (--id SUG-NNN or --all)');
    console.log('  apply       Write approved suggestions to the work tracker (--dry-run for preview)');
    console.log('  status      Show decomposition overview');
    return;
  }

  const subcommand = args[0];
  const { remaining, repoPath } = resolveRepoPath(args.slice(1));

  switch (subcommand) {
    case 'generate': {
      checkPermission(repoPath, 'write');
      const { value: featureTitle } = parseFlagValue(remaining, '--feature');
      const { value: board } = parseFlagValue(remaining, '--board');
      const { value: reqFile } = parseFlagValue(remaining, '--requirements');
      const convoy = findActiveConvoy(repoPath, remaining[0]);

      if (featureTitle) {
        const check = sanitize('decompose_generate', featureTitle, repoPath);
        if (!check.allowed) throw new Error(`CONDUIT: input blocked by sanitizer: ${check.matches.join(', ')}`);
      }

      const targetBoard = board || 'Sandbox';
      const convoyTitle = readConvoyField(convoy.root, 'title') || convoy.id;
      const repos = parseWorkstreamRepos(convoy.root);
      const repoTags = repos.map(r => `repo:${r}`);
      const baseTags = ['Conduit', `convoy:${convoy.id}`, ...repoTags];

      // Read requirements source
      let requirements = '';
      if (reqFile) {
        const reqPath = path.resolve(reqFile);
        const repoRoot = path.resolve(repoPath);
        if (!reqPath.startsWith(repoRoot)) throw new Error('--requirements path must be within the repository');
        if (!fs.existsSync(reqPath)) throw new Error(`requirements file not found: ${reqPath}`);
        requirements = fs.readFileSync(reqPath, 'utf-8');
      } else {
        const specPath = path.join(convoy.root, 'living-spec.md');
        if (fs.existsSync(specPath)) {
          requirements = fs.readFileSync(specPath, 'utf-8');
        }
      }

      const artifactId = `DEC-${String(Date.now() % 1000000).padStart(6, '0')}`;
      const suggestions: Suggestion[] = [];
      let sugCounter = 0;

      // Generate Epic
      const epicFields: ProposedFields = {
        title: featureTitle || convoyTitle,
        description: `Epic for convoy ${convoy.id}.\n\n${requirements.slice(0, 500)}`,
        tags: [...baseTags],
      };
      sugCounter++;
      const epicSug: Suggestion = {
        id: `SUG-${String(sugCounter).padStart(3, '0')}`,
        type: 'create_epic',
        proposed_fields: epicFields,
        fingerprint: fingerprint(epicFields),
        approval: 'pending',
        rationale: 'Epic created from convoy living-spec',
      };
      suggestions.push(epicSug);

      // Generate Feature per workstream (or one default)
      const workstreams = repos.length > 0 ? repos : ['default'];
      for (const ws of workstreams) {
        sugCounter++;
        const featureFields: ProposedFields = {
          title: repos.length > 1 ? `${featureTitle || convoyTitle} — ${ws}` : featureTitle || convoyTitle,
          description: `Feature for ${ws} workstream in convoy ${convoy.id}`,
          tags: [...baseTags, `repo:${ws}`],
        };
        const featureSug: Suggestion = {
          id: `SUG-${String(sugCounter).padStart(3, '0')}`,
          type: 'create_feature',
          parent_id: epicSug.id,
          proposed_fields: featureFields,
          fingerprint: fingerprint(featureFields),
          approval: 'pending',
          rationale: `Feature for workstream ${ws}`,
        };
        suggestions.push(featureSug);

        // Generate placeholder stories — the agent layer fills these in via spec-driven-planning
        // Default: 3 stories per feature as scaffolding
        const storyTemplates = [
          { title: 'Setup and configuration', clarity: 1, complexity: 1 },
          { title: 'Core implementation', clarity: 2, complexity: 2 },
          { title: 'Testing and validation', clarity: 1, complexity: 2 },
        ];

        for (const tmpl of storyTemplates) {
          sugCounter++;
          const points = deriveStoryPoints(tmpl.clarity, tmpl.complexity);
          const storyFields: ProposedFields = {
            title: `${tmpl.title} — ${ws}`,
            description: `User Story for ${tmpl.title} in ${ws}`,
            acceptance_criteria: '- [ ] TODO: Define acceptance criteria from living-spec',
            story_points: points,
            clarity: tmpl.clarity,
            complexity: tmpl.complexity,
            tags: [...baseTags, `repo:${ws}`],
          };
          const storySug: Suggestion = {
            id: `SUG-${String(sugCounter).padStart(3, '0')}`,
            type: 'create_story',
            parent_id: featureSug.id,
            proposed_fields: storyFields,
            fingerprint: fingerprint(storyFields),
            approval: 'pending',
            rationale: `Story scaffolded from template — edit before approving`,
          };
          suggestions.push(storySug);
        }
      }

      // Lint immediately
      const lintFindings = lintSuggestions(suggestions);

      const artifact: DecomposeArtifact = {
        id: artifactId,
        convoy_id: convoy.id,
        board: targetBoard,
        created_at: new Date().toISOString(),
        created_by: currentActor(),
        source: reqFile ? `file:${reqFile}` : 'living-spec.md',
        suggestions,
        lint_findings: lintFindings,
      };

      const filepath = saveArtifact(convoy.root, artifact);

      appendConvoyEvent({
        ts: new Date().toISOString(),
        type: 'stage_started',
        convoy: convoy.id,
        notes: `decompose ${artifactId}: ${suggestions.length} suggestions generated, ${lintFindings.length} lint findings`,
      }, convoy.root);

      console.log(`CONDUIT: decompose ${artifactId} generated for convoy ${convoy.id}`);
      console.log(`  Board:        ${targetBoard}`);
      console.log(`  Suggestions:  ${suggestions.length} (${suggestions.filter(s => s.type === 'create_epic').length} epic, ${suggestions.filter(s => s.type === 'create_feature').length} features, ${suggestions.filter(s => s.type === 'create_story').length} stories)`);
      console.log(`  Lint:         ${lintFindings.filter(f => f.severity === 'error').length} errors, ${lintFindings.filter(f => f.severity === 'warn').length} warnings`);
      console.log(`  Tags:         ${baseTags.join(', ')}`);
      console.log(`  Artifact:     ${filepath}`);
      console.log('');
      console.log('Next steps:');
      console.log('  1. Edit the artifact JSON to refine stories (titles, AC, descriptions)');
      console.log(`  2. ${agentName()}: read artifact and populate from living-spec requirements`);
      console.log(`  3. Re-lint: conduit decompose lint ${convoy.id}`);
      console.log(`  4. Review:  conduit decompose review ${convoy.id}`);
      console.log(`  5. Approve: conduit decompose approve ${convoy.id} --all`);
      console.log(`  6. Apply:   conduit decompose apply ${convoy.id}`);
      return;
    }

    case 'lint': {
      checkPermission(repoPath, 'read');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const artifact = loadArtifact(convoy.root);
      if (!artifact) throw new Error('no decompose artifact found — run: conduit decompose generate');

      const findings = lintSuggestions(artifact.suggestions);
      artifact.lint_findings = findings;
      saveArtifact(convoy.root, artifact);

      if (findings.length === 0) {
        console.log(`CONDUIT: decompose ${artifact.id} — all suggestions pass lint`);
        return;
      }

      console.log(`CONDUIT: decompose ${artifact.id} — ${findings.length} finding(s)`);
      console.log('');
      const errors = findings.filter(f => f.severity === 'error');
      const warnings = findings.filter(f => f.severity === 'warn');
      if (errors.length > 0) {
        console.log('ERRORS:');
        for (const f of errors) console.log(`  ✗ [${f.rule_id}] ${f.message}`);
      }
      if (warnings.length > 0) {
        console.log('WARNINGS:');
        for (const f of warnings) console.log(`  ⚠ [${f.rule_id}] ${f.message}`);
      }
      return;
    }

    case 'review': {
      checkPermission(repoPath, 'read');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const artifact = loadArtifact(convoy.root);
      if (!artifact) throw new Error('no decompose artifact found');

      console.log(`CONDUIT: decompose ${artifact.id} for convoy ${convoy.id}`);
      console.log(`  Board: ${artifact.board}   Source: ${artifact.source}   Created: ${artifact.created_at.slice(0, 10)}`);
      console.log('');

      const header = 'ID        Type            Title                                    Points  Approval';
      const div =    '--------  --------------  ---------------------------------------  ------  --------';
      console.log(header);
      console.log(div);
      for (const s of artifact.suggestions) {
        const title = s.proposed_fields.title.slice(0, 39).padEnd(39);
        const points = s.type === 'create_story' ? String(s.proposed_fields.story_points ?? '').padEnd(6) : '      ';
        const type = s.type.replace('create_', '').padEnd(14);
        console.log(`${s.id.padEnd(8)}  ${type}  ${title}  ${points}  ${s.approval}`);
      }

      if (artifact.lint_findings.length > 0) {
        console.log('');
        console.log(`Lint: ${artifact.lint_findings.filter(f => f.severity === 'error').length} errors, ${artifact.lint_findings.filter(f => f.severity === 'warn').length} warnings`);
      }
      return;
    }

    case 'approve': {
      checkPermission(repoPath, 'write');
      const { value: sugId } = parseFlagValue(remaining, '--id');
      const approveAll = remaining.includes('--all');
      const convoy = findActiveConvoy(repoPath, remaining.filter(a => a !== '--all')[0]);
      const artifact = loadArtifact(convoy.root);
      if (!artifact) throw new Error('no decompose artifact found');

      let count = 0;
      if (approveAll) {
        for (const s of artifact.suggestions) {
          if (s.approval === 'pending') {
            s.approval = 'approved';
            const contentHash = crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex');
            (s as unknown as Record<string, unknown>)['content_hash'] = contentHash;
            count++;
          }
        }
      } else if (sugId) {
        const s = artifact.suggestions.find(s => s.id === sugId);
        if (!s) throw new Error(`suggestion ${sugId} not found`);
        s.approval = 'approved';
        const contentHash = crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex');
        (s as unknown as Record<string, unknown>)['content_hash'] = contentHash;
        count = 1;
      } else {
        throw new Error('usage: conduit decompose approve [convoy-id] --id SUG-NNN or --all');
      }

      saveArtifact(convoy.root, artifact);
      console.log(`CONDUIT: ${count} suggestion(s) approved`);
      return;
    }

    case 'apply': {
      checkPermission(repoPath, 'write');
      const dryRun = remaining.includes('--dry-run');
      const convoy = findActiveConvoy(repoPath, remaining.filter(a => a !== '--dry-run')[0]);
      const artifact = loadArtifact(convoy.root);
      if (!artifact) throw new Error('no decompose artifact found');

      const approved = artifact.suggestions.filter(s => s.approval === 'approved');
      if (approved.length === 0) {
        console.log('CONDUIT: no approved suggestions to apply');
        console.log(`  Approve: conduit decompose approve ${convoy.id} --all`);
        return;
      }

      // Verify content integrity — hash must match what was approved (AC-12)
      for (const s of approved) {
        const record = s as unknown as Record<string, unknown>;
        if (record['content_hash']) {
          // Recompute hash without the content_hash field itself
          const { content_hash: _stored, ...rest } = record;
          const currentHash = crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
          if (currentHash !== _stored) {
            throw new Error(
              `CONDUIT: suggestion ${s.id} content was modified after approval (hash mismatch). Re-approve with 'conduit decompose approve'.`
            );
          }
        }
      }

      // Check for blocking lint errors
      const errors = artifact.lint_findings.filter(f => f.severity === 'error' && approved.some(s => s.id === f.suggestion_id));
      if (errors.length > 0 && !dryRun) {
        console.log(`CONDUIT: ${errors.length} lint error(s) on approved suggestions — resolve before applying`);
        for (const e of errors) console.log(`  ✗ [${e.rule_id}] ${e.message}`);
        console.log(`  Re-lint: conduit decompose lint ${convoy.id}`);
        return;
      }

      if (dryRun) {
        console.log(`CONDUIT: DRY RUN — would apply ${approved.length} suggestion(s) to ${artifact.board}`);
        console.log('');
        for (const s of approved) {
          const type = s.type.replace('create_', '').toUpperCase();
          console.log(`  [CREATE ${type}] ${s.proposed_fields.title}`);
          if (s.proposed_fields.story_points) console.log(`    Points: ${s.proposed_fields.story_points}`);
          console.log(`    Tags: ${s.proposed_fields.tags.join(', ')}`);
          if (s.parent_id) console.log(`    Parent: ${s.parent_id}`);
        }
        console.log('');
        console.log(`Remove --dry-run to apply. Requires a configured work-item tracker integration.`);
        return;
      }

      // Real apply is not available in this build — use --dry-run to preview.
      console.log('CONDUIT: apply requires an external work-item tracker integration.');
      console.log(`  Preview: conduit decompose apply ${convoy.id} --dry-run`);
      return;
    }

    case 'status': {
      checkPermission(repoPath, 'read');
      const convoy = findActiveConvoy(repoPath, remaining[0]);
      const artifact = loadArtifact(convoy.root);
      if (!artifact) {
        console.log(`CONDUIT: no decomposition for convoy ${convoy.id}`);
        console.log(`  Generate: conduit decompose generate ${convoy.id}`);
        return;
      }

      const pending = artifact.suggestions.filter(s => s.approval === 'pending').length;
      const approved = artifact.suggestions.filter(s => s.approval === 'approved').length;
      const rejected = artifact.suggestions.filter(s => s.approval === 'rejected').length;
      const errors = artifact.lint_findings.filter(f => f.severity === 'error').length;
      const warnings = artifact.lint_findings.filter(f => f.severity === 'warn').length;

      console.log(`CONDUIT: decompose ${artifact.id} for convoy ${convoy.id}`);
      console.log(`  Board:      ${artifact.board}`);
      console.log(`  Source:     ${artifact.source}`);
      console.log(`  Created:    ${artifact.created_at.slice(0, 10)} by ${artifact.created_by}`);
      console.log(`  Suggestions: ${artifact.suggestions.length} (${pending} pending, ${approved} approved, ${rejected} rejected)`);
      console.log(`  Lint:        ${errors} errors, ${warnings} warnings`);
      if (artifact.applied_at) console.log(`  Applied:    ${artifact.applied_at.slice(0, 10)}`);
      return;
    }

    default:
      throw new Error(`unknown decompose subcommand: ${subcommand}`);
  }
}
