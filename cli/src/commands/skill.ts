// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/skill.ts
// description: Skill creation and management — scaffold skills with Conduit security rules.
//              Supports conduit skill create, list, validate, sync, approve.
//              syncSkills is exported so `conduit publish` runs it as a
//              follow-on step, keeping the remote skills registry current.
// owner:       BOTH
// update:      Manual as skill management behavior changes.
// schema:      none
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { resolveRepoPath, parseFlagValue, currentActor, todayISO } from '../utils.js';
import { checkPermission } from '../internal/signals.js';
import { sanitize } from '../internal/sanitizer.js';
import { readConduitConfig } from '../internal/config.js';
import { agentHostLabel, getAgentHostPaths, getBundledSkillInstallTargets, type AgentSkillInstallTarget } from '../internal/agent-host.js';
import { adaptSkillMarkdownForHost } from '../internal/skills-install.js';

export async function runSkill(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit skill <create|list|validate|sync|install|request-review|approve> [args] [--repo path]');
    console.log('');
    console.log('Subcommands:');
    console.log('  create          Scaffold a new skill with Conduit security rules [--with-evals]');
    console.log('  list            List available skills');
    console.log('  validate        Check skill files for security compliance');
    console.log('  sync            Sync all local skills to the registry API');
    console.log('  install         Install approved skills from the registry into the active host skill home [--all-hosts]');
    console.log('  request-review  Request review for a skill --name "skill-name"');
    console.log('  approve         Alias for request-review');
    return;
  }

  const subcommand = args[0];
  const { remaining, repoPath } = resolveRepoPath(args.slice(1));

  switch (subcommand) {
    case 'create': {
      checkPermission(repoPath, 'write');
      const { value: name } = parseFlagValue(remaining, '--name');
      const { value: description } = parseFlagValue(remaining, '--description');
      const { value: scope } = parseFlagValue(remaining, '--scope');
      const withEvals = remaining.includes('--with-evals');

      if (!name) throw new Error('usage: conduit skill create --name "skill-name" --description "what it does in 40+ chars" [--scope shared|personal] [--with-evals]');

      // Sanitize name
      const sanitized = sanitize('skill_create', name, repoPath);
      if (!sanitized.allowed) throw new Error(`CONDUIT: skill name blocked by sanitizer: ${sanitized.matches.join(', ')}`);

      // Validate name format: lowercase alphanumeric + hyphens, no leading/trailing dash,
      // single-character names allowed. Rejects: uppercase, spaces, special chars, trailing/leading dash.
      if (!/^[a-z]$|^[a-z][a-z0-9-]*[a-z0-9]$/.test(name)) {
        throw new Error('CONDUIT: skill name must be lowercase alphanumeric with hyphens, no leading or trailing dash (e.g., my-skill, skill2)');
      }

      // Description contract: provided, ≥ 40 chars, no TODO markers.
      if (!description) {
        throw new Error('CONDUIT: --description is required (minimum 40 chars, describe what the skill does and when it triggers)');
      }
      if (description.length < 40) {
        throw new Error(`CONDUIT: --description must be at least 40 chars (got ${description.length}); describe what the skill does and when it triggers`);
      }
      if (/\bTODO\b/i.test(description)) {
        throw new Error('CONDUIT: --description must not contain TODO — write a real description');
      }

      const isShared = scope === 'shared';
      // Shared skills: flat <name>.md under skills/shared/ (existing convention).
      // Personal skills: nested <name>/SKILL.md under .claude/skills/ — matches install-from-registry layout.
      let skillDir: string;
      let skillPath: string;
      let managedFilePath: string;
      if (isShared) {
        skillDir = path.join(repoPath, 'skills', 'shared');
        fs.mkdirSync(skillDir, { recursive: true });
        skillPath = path.join(skillDir, `${name}.md`);
        managedFilePath = `skills/shared/${name}.md`;
        if (fs.existsSync(skillPath)) throw new Error(`CONDUIT: skill ${name} already exists at ${skillPath}`);
      } else {
        const skillRoot = path.join(repoPath, '.claude', 'skills', name);
        if (fs.existsSync(skillRoot)) throw new Error(`CONDUIT: skill ${name} already exists at ${skillRoot}`);
        fs.mkdirSync(skillRoot, { recursive: true });
        skillDir = skillRoot;
        skillPath = path.join(skillRoot, 'SKILL.md');
        managedFilePath = `.claude/skills/${name}/SKILL.md`;
      }

      const skillContent = `---
name: ${name}
description: ${description}
allowed-tools: Bash, Read, Glob, Grep
---

<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        ${managedFilePath}
# description: ${description}
# owner:       ${isShared ? 'BOTH' : currentActor()}
# update:      Manual
# schema:      none
# last_update: ${todayISO()}
#
# CONDUIT SECURITY RULES FOR SKILLS:
# 1. Skills that write to the work tracker, git, or PRs must be team-lead reviewed
# 2. Scope must be explicitly bounded — never touch resources outside scope
# 3. Credentials from env vars or vault only — never hardcoded
# 4. Skills that auto-resolve PR comments must log reasoning
# 5. All user input must pass through sanitizer
# ─────────────────────────────────────────────────────────────────────
-->

# ${name}

## Purpose

${description}

## When to trigger

Describe the conditions under which this skill should fire. Be specific — list the user intents, command invocations, or file patterns that should activate it.

## When NOT to trigger

List situations where this skill should stay out of the way. Every skill should have a refusal list so it does not over-trigger.

## Scope

- **Bounded to:** the files, repos, or systems this skill may touch (state concretely; do not leave blank)
- **Writes to:** what this skill modifies (local files, work tracker, git, registry) — enumerate
- **Requires review:** ${isShared ? 'YES — shared skill, team lead must review before distribution' : 'NO — personal skill'}

## Prerequisites

List what must be true before the skill runs (active convoy, branch checked out, environment variables set).

## Example invocations

Show two or three concrete invocations with the expected observable outcome. One happy-path, one edge-case.

## Steps

1. **Step 1:** first concrete action the skill takes
2. **Step 2:** second action
3. **Step 3:** verification that the skill achieved its purpose

## Verification

State how to confirm the skill completed correctly — exit code, file presence, log line, or other observable signal.

## Security Notes

- All user input sanitized via \`sanitize()\` before processing
- Credentials sourced from environment variables only — never hardcoded
- Scope explicitly bounded to prevent cross-contamination
`;

      fs.writeFileSync(skillPath, skillContent, 'utf-8');

      // Scaffold evals directory if --with-evals flag is set
      if (withEvals) {
        // Personal skills: evals live alongside the skill dir (.claude/skills/<name>/evals/).
        // Shared skills: evals live at skills/evals/<name>/ (existing convention).
        const evalsDir = isShared
          ? path.join(path.dirname(skillPath), '..', 'evals', name)
          : path.join(skillDir, 'evals');
        fs.mkdirSync(evalsDir, { recursive: true });

        const evalsJson = {
          skill: name,
          description: description,
          created: todayISO(),
          test_cases: [
            {
              id: `${name}-01`,
              prompt: `Invoke ${name} in its most common scenario. Describe the request the user would make.`,
              expected_output: `The skill runs end-to-end and produces the observable outcome documented in its Purpose section.`,
              expectations: [
                'Skill loads its directive and follows the documented Steps',
                'Observable outcome matches the Verification section',
              ],
              tags: ['happy-path'],
            },
            {
              id: `${name}-02`,
              prompt: `Invoke ${name} with an edge case or failure-mode input. Describe the off-nominal request.`,
              expected_output: `Skill handles the edge case without crashing and surfaces a clear message or safe fallback.`,
              expectations: [
                'No unhandled exception or process crash',
                'Clear error message or safe fallback is surfaced',
              ],
              tags: ['edge-case'],
            },
          ],
        };

        fs.writeFileSync(
          path.join(evalsDir, 'evals.json'),
          JSON.stringify(evalsJson, null, 2) + '\n',
          'utf-8',
        );

        const evalsReadme = `# Evals for ${name}

## What This Is

Test cases for the \`${name}\` skill. Each test case defines a prompt, the expected output, and specific expectations to verify.

## The Eval Workflow

1. **Write test cases** in \`evals.json\` — one per scenario you want to verify
2. **Run with skill** — invoke Claude Code with the skill loaded, using the test case prompt
3. **Run baseline** — invoke Claude Code WITHOUT the skill, using the same prompt
4. **Grade** — compare outputs against expectations. The skill version should meet all expectations; the baseline version likely will not.
5. **Iterate** — if the skill version fails an expectation, update the skill and re-run

## evals.json Format

\`\`\`json
{
  "skill": "skill-name",
  "test_cases": [
    {
      "id": "skill-name-01",
      "prompt": "The exact prompt to give Claude Code",
      "expected_output": "Human-readable description of correct output",
      "expectations": [
        "Specific verifiable assertion about the output",
        "Another assertion"
      ],
      "tags": ["happy-path"]
    }
  ]
}
\`\`\`

## Running Evals Manually

Until the automated eval runner is built, run evals by hand:

\`\`\`bash
# 1. Start Claude Code with the skill
#    Load the skill file, then paste the test case prompt

# 2. Check each expectation against the output
#    Mark pass/fail per expectation

# 3. Repeat without the skill for baseline comparison
\`\`\`

## Tags

Use tags to categorize test cases:
- \`happy-path\` — standard usage, should always pass
- \`edge-case\` — unusual input or boundary condition
- \`security\` — tests for injection resistance or credential handling
- \`regression\` — added after a bug was found and fixed
`;

        fs.writeFileSync(
          path.join(evalsDir, 'README.md'),
          evalsReadme,
          'utf-8',
        );

        console.log(`CONDUIT: evals scaffolded at ${evalsDir}`);
      }

      console.log(`CONDUIT: skill ${name} created`);
      console.log(`  ${skillPath}`);
      if (isShared) {
        console.log('  ⚠ Shared skill — requires team lead review before distribution');
      }
      console.log('');
      console.log('Next steps:');
      console.log(`  1. Edit ${skillPath} to fill in steps and scope`);
      if (withEvals) {
        console.log(`  2. Fill in test cases in evals/${name}/evals.json`);
        console.log(`  3. Validate: conduit skill validate --name ${name}`);
        if (isShared) console.log('  4. Submit for team lead review');
      } else {
        console.log(`  2. Validate: conduit skill validate --name ${name}`);
        if (isShared) console.log('  3. Submit for team lead review');
        console.log(`  Tip: re-run with --with-evals to scaffold test cases`);
      }
      return;
    }

    case 'list': {
      checkPermission(repoPath, 'read');
      const sharedDir = path.join(repoPath, 'skills', 'shared');
      const personalDir = path.join(repoPath, '.claude', 'skills');

      // Entries are either flat <name>.md (legacy) or nested <name>/SKILL.md (current default
      // for personal scaffolds, and the only layout install-from-registry produces). Walk both.
      type SkillEntry = { displayName: string; filePath: string };
      const collectSkills = (dir: string): SkillEntry[] => {
        if (!fs.existsSync(dir)) return [];
        const found: SkillEntry[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            found.push({ displayName: entry.name.replace('.md', ''), filePath: path.join(dir, entry.name) });
          } else if (entry.isDirectory()) {
            const skillMd = path.join(dir, entry.name, 'SKILL.md');
            if (fs.existsSync(skillMd)) {
              found.push({ displayName: entry.name, filePath: skillMd });
            }
          }
        }
        return found;
      };
      const shared = collectSkills(sharedDir);
      const personal = collectSkills(personalDir);

      if (shared.length === 0 && personal.length === 0) {
        console.log('CONDUIT: no skills found');
        console.log(`  Create one: conduit skill create --name "my-skill" --description "what it does"`);
        return;
      }

      const printEntry = (e: SkillEntry): void => {
        const content = fs.readFileSync(e.filePath, 'utf-8');
        const descMatch = content.match(/^description:\s*(.+)/m);
        console.log(`  ${e.displayName.padEnd(30)} ${descMatch?.[1] ?? ''}`);
      };

      if (shared.length > 0) {
        console.log('Shared skills:');
        for (const s of shared) printEntry(s);
      }
      if (personal.length > 0) {
        console.log('Personal skills:');
        for (const p of personal) printEntry(p);
      }
      return;
    }

    case 'validate': {
      checkPermission(repoPath, 'read');
      const { value: name } = parseFlagValue(remaining, '--name');

      const dirs = [
        path.join(repoPath, 'skills', 'shared'),
        path.join(repoPath, '.claude', 'skills'),
      ];

      const filesToCheck: string[] = [];
      if (name) {
        for (const dir of dirs) {
          // Flat file: skills/shared/<name>.md
          const flat = path.join(dir, `${name}.md`);
          if (fs.existsSync(flat)) filesToCheck.push(flat);
          // Subdirectory: .claude/skills/<name>/SKILL.md
          const nested = path.join(dir, name, 'SKILL.md');
          if (fs.existsSync(nested)) filesToCheck.push(nested);
        }
        if (filesToCheck.length === 0) throw new Error(`skill ${name} not found`);
      } else {
        for (const dir of dirs) {
          if (!fs.existsSync(dir)) continue;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            // Flat .md file (e.g., skills/shared/my-skill.md)
            if (entry.isFile() && entry.name.endsWith('.md')) {
              filesToCheck.push(path.join(dir, entry.name));
            }
            // Subdirectory with SKILL.md (e.g., .claude/skills/conduit-context/SKILL.md)
            if (entry.isDirectory()) {
              const skillMd = path.join(dir, entry.name, 'SKILL.md');
              if (fs.existsSync(skillMd)) filesToCheck.push(skillMd);
            }
          }
        }
      }

      // Also scan scripts/, standards/, and *.yaml files for credential leaks
      const extraDirs = [
        { dir: path.join(repoPath, 'scripts'), glob: '**' },
        { dir: path.join(repoPath, 'standards'), glob: '**' },
      ];
      for (const { dir } of extraDirs) {
        if (fs.existsSync(dir)) {
          const walk = (d: string): void => {
            for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
              const full = path.join(d, entry.name);
              if (entry.isDirectory()) { walk(full); }
              else if (entry.isFile()) { filesToCheck.push(full); }
            }
          };
          walk(dir);
        }
      }
      // Scan top-level *.yaml files
      if (fs.existsSync(repoPath)) {
        for (const entry of fs.readdirSync(repoPath, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith('.yaml')) {
            filesToCheck.push(path.join(repoPath, entry.name));
          }
        }
      }

      if (filesToCheck.length === 0) {
        console.log('CONDUIT: no skills to validate');
        return;
      }

      let issues = 0;
      for (const filePath of filesToCheck) {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Use the folder name for nested SKILL.md so we show a meaningful label.
        const baseName = path.basename(filePath);
        const skillName = baseName === 'SKILL.md'
          ? path.basename(path.dirname(filePath))
          : baseName.replace(/\.[^.]+$/, '');
        const fileIssues: string[] = [];
        const isSkillFile = filePath.includes(path.join('skills', path.sep)) || filePath.includes(path.join('.claude', 'skills'));
        // Shared skills ship to every user's machine, so they need full metadata.
        // Personal/bundled skills (.claude/skills) are launchers or in-repo helpers
        // and only need the security checks below.
        const isSharedSkill = filePath.includes(path.join('skills', 'shared'));

        // Check frontmatter (all skill files)
        if (isSkillFile) {
          if (!content.startsWith('---')) fileIssues.push('missing YAML frontmatter');
          if (!content.includes('description:')) fileIssues.push('missing description in frontmatter');

          // Description length check — applies to all skill files.
          const descLineMatch = content.match(/^description:\s*(.+)$/m);
          if (descLineMatch) {
            const desc = descLineMatch[1].trim();
            if (desc.length < 40) {
              fileIssues.push(`description too short (${desc.length} chars, need ≥ 40)`);
            }
            if (/\bTODO\b/i.test(desc)) {
              fileIssues.push('description contains TODO — write a real description');
            }
          }

          // TODO markers anywhere in the skill file body — applies to all skill files.
          // Match the literal word TODO (case-sensitive) so casual prose using "to do"
          // or unrelated words does not trip the check. Scaffold placeholders are the
          // primary target.
          if (/\bTODO\b/.test(content)) {
            fileIssues.push('contains TODO placeholders');
          }
        }

        // Shared skills ship broadly, so they also need explicit Scope sections.
        if (isSharedSkill) {
          if (!content.includes('Scope') && !content.includes('scope')) fileIssues.push('missing Scope section');
          if (!content.includes('Bounded to')) fileIssues.push('missing scope boundary definition');
        }

        // Check for hardcoded credentials. Exclude shell-variable references
        // (KEY="$VAR"), env-expansion placeholders (KEY="${VAR}"), and obvious
        // template substitution markers — those aren't leaks.
        if (/(?:password|secret|token|key)\s*[:=]\s*["'](?!\$|\{\{|<[A-Z_]+>|\s*["'])[^"']+["']/i.test(content)) {
          fileIssues.push('SECURITY: possible hardcoded credential detected');
        }

        // Reject hardcoded user paths — skills must be user-agnostic.
        // Use the shim (~/.claude/bin/conduit) or env vars; never bake in a path.
        if (/C:[\\/]Users[\\/][a-zA-Z]/i.test(content) || /\/Users\/[a-zA-Z]+\//i.test(content) || /\/home\/[a-zA-Z]+\//i.test(content)) {
          fileIssues.push('ERROR: hardcoded user path detected — invoke via ~/.claude/bin/conduit or use env vars');
        }

        if (fileIssues.length > 0) {
          console.log(`${skillName}: ${fileIssues.length} issue(s)`);
          for (const issue of fileIssues) console.log(`  ⚠ ${issue}`);
          issues += fileIssues.length;
        } else {
          console.log(`${skillName}: ✓ passed`);
        }
      }

      console.log('');
      console.log(`CONDUIT: ${filesToCheck.length} skill(s) validated, ${issues} issue(s) found`);
      return;
    }

    case 'sync': {
      checkPermission(repoPath, 'read');
      const seedApproved = remaining.includes('--seed-approved');
      await syncSkills(repoPath, seedApproved);
      return;
    }

    case 'install': {
      await installSkillsFromRegistry(repoPath, { allHosts: remaining.includes('--all-hosts') });
      return;
    }

    case 'request-review':
    case 'approve': {
      checkPermission(repoPath, 'write');
      const { value: name } = parseFlagValue(remaining, '--name');
      if (!name) throw new Error('usage: conduit skill request-review --name "skill-name"');
      await requestSkillReview(name, repoPath);
      return;
    }

    default:
      throw new Error(`unknown skill subcommand: ${subcommand}`);
  }
}

// ── Registry config resolution (mirrors publish.ts pattern) ─────────

function resolveRegistryConfig(repoPath: string): { baseUrl: string; apiKey: string } | null {
  // Environment variables take precedence
  let baseUrl = process.env['CONDUIT_REGISTRY_URL'] ?? '';
  let apiKey = process.env['CONDUIT_REGISTRY_API_KEY'] ?? '';

  // Fall back to .conduit/config.yaml registry section
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
    console.log('CONDUIT: CONDUIT_REGISTRY_URL and CONDUIT_REGISTRY_API_KEY required for skill sync');
    console.log('  Set these environment variables or configure in .conduit/config.yaml');
    return null;
  }

  return { baseUrl, apiKey };
}

// Same resolution as resolveRegistryConfig but silent on missing config —
// used by the publish follow-on sync where missing registry config has
// already been reported by the publish step itself.
function resolveRegistryConfigQuiet(repoPath: string): { baseUrl: string; apiKey: string } | null {
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
      // Config file may not exist — silent by design
    }
  }

  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

// ── sync subcommand ─────────────────────────────────────────────────

export interface SkillSyncSummary {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
}

/**
 * Sync all local skills (bundled .claude/skills + skills/shared) to the registry.
 * Exported so `conduit publish` can run it as a follow-on step — keeps the
 * remote skills registry current without a separate manual sync.
 *
 * opts.quiet suppresses per-skill output (publish prints one summary line
 * from the returned counts instead). Missing registry config or an empty
 * skill set return null/zero-total without noise when quiet.
 */
export async function syncSkills(
  repoPath: string,
  seedApproved = false,
  opts: { quiet?: boolean } = {},
): Promise<SkillSyncSummary | null> {
  const quiet = opts.quiet === true;
  const registryCfg = quiet ? resolveRegistryConfigQuiet(repoPath) : resolveRegistryConfig(repoPath);
  if (!registryCfg) return null;
  const { baseUrl, apiKey } = registryCfg;

  // Find all skill files
  const personalDir = path.join(repoPath, '.claude', 'skills');
  const sharedDir = path.join(repoPath, 'skills', 'shared');

  const skillFiles: Array<{ path: string; scope: string }> = [];
  for (const [dir, scope] of [[personalDir, 'bundled'], [sharedDir, 'shared']] as const) {
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        // Flat .md files (e.g., skills/shared/my-skill.md)
        if (entry.isFile() && entry.name.endsWith('.md')) {
          skillFiles.push({ path: path.join(dir, entry.name), scope });
        }
        // Subdirectory with SKILL.md (e.g., .claude/skills/conduit-context/SKILL.md)
        if (entry.isDirectory()) {
          const skillMd = path.join(dir, entry.name, 'SKILL.md');
          if (fs.existsSync(skillMd)) {
            skillFiles.push({ path: skillMd, scope });
          }
        }
      }
    }
  }

  const summary: SkillSyncSummary = { total: skillFiles.length, created: 0, updated: 0, unchanged: 0, failed: 0 };

  if (skillFiles.length === 0) {
    if (!quiet) console.log('CONDUIT: no skills found to sync');
    return summary;
  }

  if (!quiet) console.log(`CONDUIT: syncing ${skillFiles.length} skill(s) to the registry${seedApproved ? ' (marking approved — one-time bootstrap)' : ''}...`);

  for (const { path: filePath, scope } of skillFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Parse YAML frontmatter
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    let name = path.basename(filePath, '.md');
    let description = '';
    let body = content;

    if (fmMatch) {
      const frontmatter = fmMatch[1];
      body = fmMatch[2];
      const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim();
    }

    try {
      const res = await fetch(`${baseUrl}/api/conduit/skills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          name,
          description,
          scope,
          content: body,
          ownerEmail: process.env['USER'] || process.env['USERNAME'] || 'unknown',
          repoSlug: path.basename(repoPath),
          ...(seedApproved ? { status: 'approved' } : {}),
        }),
      });

      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const action = String(data['action'] ?? 'synced');
        if (action === 'created') summary.created++;
        else if (action === 'updated') summary.updated++;
        else summary.unchanged++;
        if (!quiet) console.log(`  ${action}: ${name}`);
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText })) as Record<string, unknown>;
        summary.failed++;
        if (!quiet) console.log(`  failed: ${name} — ${err['error'] ?? res.statusText}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.failed++;
      if (!quiet) console.log(`  failed: ${name} — ${msg}`);
    }
  }

  return summary;
}

// ── install subcommand ───────────────────────────────────────────────

async function installSkillsFromRegistry(repoPath: string, opts: { allHosts?: boolean } = {}): Promise<void> {
  const registryCfg = resolveRegistryConfig(repoPath);
  if (!registryCfg) return;
  const { baseUrl, apiKey } = registryCfg;

  let skills: Array<{ name: string; description: string; content: string }>;
  try {
    const res = await fetch(`${baseUrl}/api/conduit/skills?status=approved`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.log(`CONDUIT: failed to fetch skills — ${res.statusText}`);
      return;
    }
    const data = await res.json() as { skills: Array<{ name: string; description: string; content: string }> };
    skills = data.skills;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`CONDUIT: failed to fetch skills — ${msg}`);
    return;
  }

  if (!skills || skills.length === 0) {
    console.log('CONDUIT: no approved skills found in the registry');
    return;
  }

  const targets = resolveRegistryInstallTargets(opts.allHosts === true);
  if (targets.length === 0) {
    console.log('CONDUIT: no Claude/Codex skill home detected; set CONDUIT_AGENT_HOST=codex or create a host home first');
    return;
  }

  let installed = 0;
  for (const target of targets) {
    for (const skill of skills) {
      const dir = path.join(target.skillsDir, skill.name);
      fs.mkdirSync(dir, { recursive: true });
      const content = renderRegistrySkillForTarget(skill, target);
      fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
      console.log(`  installed: ${skill.name} -> ${target.label}`);
      installed++;
    }
    console.log(`CONDUIT: ${skills.length} skill(s) installed to ${target.label} skills at ${target.skillsDir}`);
  }
  console.log(`CONDUIT: ${installed} host-native skill install(s) complete`);
}

function resolveRegistryInstallTargets(allHosts: boolean): AgentSkillInstallTarget[] {
  if (allHosts) return getBundledSkillInstallTargets();
  const hostPaths = getAgentHostPaths();
  if (hostPaths.host === 'claude' || hostPaths.host === 'codex') {
    return [{
      host: hostPaths.host,
      label: agentHostLabel(hostPaths.host),
      hostHome: hostPaths.hostHome,
      skillsDir: hostPaths.skillsDir,
      active: true,
      reason: `active host (${hostPaths.source})`,
    }];
  }
  return getBundledSkillInstallTargets();
}

function renderRegistrySkillForTarget(
  skill: { name: string; description: string; content: string },
  target: AgentSkillInstallTarget,
): string {
  const canonical = [
    '---',
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    'allowed-tools: Bash, Read, Glob, Grep',
    '---',
    '',
    skill.content.trimEnd(),
    '',
  ].join('\n');
  return adaptSkillMarkdownForHost(canonical, target.host);
}

// ── request-review subcommand ────────────────────────────────────────

async function requestSkillReview(name: string, repoPath: string): Promise<void> {
  const registryCfg = resolveRegistryConfig(repoPath);
  if (!registryCfg) return;
  const { baseUrl, apiKey } = registryCfg;

  // Find the skill file to include its content in the review request.
  // Personal skills may be either nested <name>/SKILL.md (current default) or
  // flat <name>.md (legacy). Shared skills are flat. Check all layouts, preferring
  // shared > nested personal > flat personal.
  const sharedPath = path.join(repoPath, 'skills', 'shared', `${name}.md`);
  const personalNestedPath = path.join(repoPath, '.claude', 'skills', name, 'SKILL.md');
  const personalFlatPath = path.join(repoPath, '.claude', 'skills', `${name}.md`);
  let skillFilePath: string | null = null;
  let scope = 'personal';

  if (fs.existsSync(sharedPath)) {
    skillFilePath = sharedPath;
    scope = 'shared';
  } else if (fs.existsSync(personalNestedPath)) {
    skillFilePath = personalNestedPath;
    scope = 'personal';
  } else if (fs.existsSync(personalFlatPath)) {
    skillFilePath = personalFlatPath;
    scope = 'personal';
  }

  let content = '';
  let description = '';
  if (skillFilePath) {
    const raw = fs.readFileSync(skillFilePath, 'utf-8');
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fmMatch) {
      const frontmatter = fmMatch[1];
      content = fmMatch[2];
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (descMatch) description = descMatch[1].trim();
    } else {
      content = raw;
    }
  }

  try {
    const res = await fetch(`${baseUrl}/api/conduit/skills`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name,
        description,
        scope,
        content,
        status: 'pending_review',
        ownerEmail: process.env['USER'] || process.env['USERNAME'] || 'unknown',
        repoSlug: path.basename(repoPath),
      }),
    });

    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      console.log(`CONDUIT: skill "${name}" submitted for review (${data['action'] ?? 'updated'})`);
      console.log('  Approval happens in the registry by a Leader/TeamLead');
    } else {
      const err = await res.json().catch(() => ({ error: res.statusText })) as Record<string, unknown>;
      console.log(`CONDUIT: failed to request review for "${name}" — ${err['error'] ?? res.statusText}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`CONDUIT: failed to request review for "${name}" — ${msg}`);
  }
}
