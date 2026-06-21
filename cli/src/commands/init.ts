// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/init.ts
// description: Highway Init — onboard repos into the Conduit network.
//              Generates CONDUIT.md, CONTEXT.md, QA_ACCEPTANCE.md.
//              Registers in highway-index.
// owner:       BOTH
// update:      Manual as Highway Init behavior evolves.
// schema:      highways/repo-signals.schema.yaml
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import yaml from 'js-yaml';
import { todayISO, currentActor } from '../utils.js';
import { storeSignalsHash } from '../internal/signals.js';
import { readConfig, writeConfig } from '../internal/conduit-config.js';

// ── Interactive prompt helper ──────────────────────────────────────

function ask(rl: readline.Interface, question: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal ? ` [${defaultVal}]` : '';
  return new Promise(resolve => {
    rl.question(`  ${question}${suffix}: `, answer => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

function askChoice(rl: readline.Interface, question: string, options: string[], defaultVal?: string): Promise<string> {
  const optStr = options.map(o => o === defaultVal ? `[${o}]` : o).join(' | ');
  return new Promise(resolve => {
    rl.question(`  ${question}\n  Options: ${optStr}\n  > `, answer => {
      const val = answer.trim() || defaultVal || options[0];
      if (options.includes(val)) {
        resolve(val);
      } else {
        console.log(`    (defaulting to ${defaultVal || options[0]})`);
        resolve(defaultVal || options[0]);
      }
    });
  });
}

// ── Interfaces ─────────────────────────────────────────────────────

interface InitAnswers {
  purpose: string;
  repoType: string;
  techStack: string;
  liveUrl: string;
  workItem: string;
  owner: string;
  architect: string;
  security: string;
  neverDo: string;
  neverTouch: string;
  antiPatterns: string;
  dataRelationships: string;
}

// Map repo type to operational_status and system_class
function mapRepoType(repoType: string): { operational_status: string; system_class: string } {
  const map: Record<string, { operational_status: string; system_class: string }> = {
    'active-app': { operational_status: 'ACTIVE', system_class: 'MODERN' },
    'active-tool': { operational_status: 'ACTIVE', system_class: 'MODERN' },
    'shared-library': { operational_status: 'ACTIVE', system_class: 'MODERN' },
    'source-reference': { operational_status: 'READ-ONLY', system_class: 'MODERN' },
    'poc': { operational_status: 'ACTIVE', system_class: 'MODERN' },
    'infrastructure': { operational_status: 'ACTIVE', system_class: 'INTEGRATION' },
    'legacy': { operational_status: 'ACTIVE', system_class: 'LEGACY' },
    'mainframe': { operational_status: 'ACTIVE', system_class: 'MAINFRAME' },
    'unstarted': { operational_status: 'OBSERVE', system_class: 'MODERN' },
    'archived': { operational_status: 'OBSERVE', system_class: 'MODERN' },
    'test': { operational_status: 'OBSERVE', system_class: 'MODERN' },
  };
  return map[repoType] ?? { operational_status: 'ACTIVE', system_class: 'MODERN' };
}

// ── File generators ────────────────────────────────────────────────

function generateConduitMd(slug: string, answers: InitAnswers): string {
  const { operational_status, system_class } = mapRepoType(answers.repoType);
  const today = todayISO();

  const neverDoLines = answers.neverDo
    ? answers.neverDo.split(',').map(s => `- ${s.trim()}`).join('\n')
    : '- Push to main without convoy approval\n- Modify infrastructure without architect review';

  const neverTouchLines = answers.neverTouch
    ? answers.neverTouch.split(',').map(s => `- ${s.trim()}`).join('\n')
    : '- .env files\n- Migration files that have already run in production';

  return `<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        CONDUIT.md
# description: Highway document for ${slug}. Repo signals and agent rules.
# owner:       BOTH
# update:      When repo signals or operating rules change.
# schema:      highways/repo-signals.schema.yaml
# last_update: ${today}
# ─────────────────────────────────────────────────────────────────────
-->

# ${slug}

${answers.purpose}

## Repo Signals

\`\`\`yaml
operational_status: ${operational_status}
system_class: ${system_class}
escalation_contacts:
  owner: "${answers.owner}"
  architect: "${answers.architect}"
  security: "${answers.security}"
  compliance: ""
  specialist: ""
highway_init_date: "${today}"
last_context_update: "${today}"
\`\`\`

## What This Repo Is

${answers.purpose}

- **Type:** ${answers.repoType}
- **Tech Stack:** ${answers.techStack || 'TODO: confirm'}
${answers.liveUrl ? `- **Live URL:** ${answers.liveUrl}` : ''}
${answers.workItem ? `- **Work Item:** ${answers.workItem}` : ''}

## What Agents May Do Here

- Read all source files for context and analysis
- Implement changes within active convoy workstreams
- Run tests and build commands
- Create branches for convoy work
- Generate CONTEXT.md updates (subject to owner approval)

## What Agents Must Not Do Here

${neverDoLines}

### Files/Directories Agents Must Not Touch

${neverTouchLines}

${answers.antiPatterns ? `### Patterns That Do NOT Apply Here\n\n${answers.antiPatterns}\n` : ''}

## Data Relationships

${answers.dataRelationships || 'No known cross-repo data dependencies.'}
`;
}

function generateContextMd(slug: string, answers: InitAnswers): string {
  const today = todayISO();
  return `<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        CONTEXT.md
# description: Living architecture summary for ${slug}.
# owner:       BOTH
# update:      Post-merge by Context Updater Agent, with owner approval.
# schema:      none
# last_update: ${today}
# ─────────────────────────────────────────────────────────────────────
-->

# CONTEXT: ${slug}

## Architecture Overview

| Layer | Technology |
|-------|-----------|
| Stack | ${answers.techStack || 'TODO: confirm'} |
| Status | ${answers.repoType} |

## Module or Service Map

| Module | Path | Description | Status |
|--------|------|-------------|--------|
| TODO | src/ | TODO: map modules after codebase scan | active |

## Data Flow Summary

TODO: Document data flow after codebase scan.

## Authentication and Authorization

TODO: Document auth model after codebase scan.

## Significant Changes (Last 90 Days)

TODO: Populate from git log after init.

## Technical Debt Relevant to Routing

TODO: Document after codebase analysis.

## Performance Characteristics

TODO: Document after first deployment.

## Known Failure Modes

TODO: Document after first QA cycle.

---

> This CONTEXT.md was generated by \`conduit init\` on ${today}.
> Enrich it by running a codebase scan or having an agent read the source.
`;
}

function generateAcceptanceMd(slug: string, answers: InitAnswers): string {
  const today = todayISO();
  return `<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        QA_ACCEPTANCE.md
# description: Quality acceptance registry for ${slug}.
# owner:       BOTH
# update:      When new acceptance criteria are added or risks discovered.
# schema:      none
# last_update: ${today}
# ─────────────────────────────────────────────────────────────────────
-->

# QA & Acceptance: ${slug}

## Criteria Registry

| ID | Criterion | Type | Status | Notes |
|----|-----------|------|--------|-------|
| AC-001 | Build succeeds without errors | build | active | baseline |
| AC-002 | All tests pass | test | active | baseline |
| AC-003 | conduit validate highway passes | validation | active | baseline |

## Test Case Mapping

| Criterion ID | Test Case | Stage | Owner |
|---|---|---|---|
| AC-001 | \`npm run build\` or equivalent | 3 | code |
| AC-002 | \`npm test\` or equivalent | 4 | qa |
| AC-003 | \`conduit validate highway ${slug}/\` | 4 | qa |

## Visual Baseline Targets

None defined yet.

## Known Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| TODO | medium | TODO: identify after first QA cycle |

---

> Generated by \`conduit init\` on ${today}. Enrich after first QA gate.
`;
}

function generateIndexEntry(slug: string, answers: InitAnswers): string {
  const { operational_status, system_class } = mapRepoType(answers.repoType);
  const today = todayISO();
  return `# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        highway-index/repos/${slug}.yaml
# description: Highway Index entry for ${slug}.
# owner:       BOTH
# update:      On Repo Signal changes.
# schema:      highway-index/schema/repo-entry.schema.json
# last_update: ${today}
# ─────────────────────────────────────────────────────────────────────
repo:
  slug: ${slug}
  display_name: "${answers.purpose.slice(0, 60)}"
  remote_url: ""
  signals:
    operational_status: ${operational_status}
    system_class: ${system_class}
    escalation_contacts:
      owner: "${answers.owner}"
      architect: "${answers.architect}"
      security: "${answers.security}"
      compliance: ""
      specialist: ""
  highway_init_date: "${today}"
  last_context_update: "${today}"
  highways:
    conduit_md: "CONDUIT.md"
    context_md: "CONTEXT.md"
    acceptance_md: "QA_ACCEPTANCE.md"
  active_workstreams: []
  notes: "${answers.purpose.slice(0, 100)}"
`;
}

// ── Scan mode (non-interactive) ────────────────────────────────────

function scanDefaults(repoPath: string): Partial<InitAnswers> {
  const defaults: Partial<InitAnswers> = {
    owner: currentActor(),
    architect: currentActor(),
    security: currentActor(),
  };

  // Detect tech stack from package.json
  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const stack: string[] = [];
      if (deps['@sveltejs/kit'] || deps['svelte']) stack.push('SvelteKit');
      if (deps['drizzle-orm']) stack.push('Drizzle ORM');
      if (deps['next']) stack.push('Next.js');
      if (deps['express']) stack.push('Express');
      if (deps['react']) stack.push('React');
      if (deps['vue']) stack.push('Vue');
      if (deps['typescript']) stack.push('TypeScript');
      defaults.techStack = stack.join(' + ') || 'Node.js';
      defaults.purpose = pkg.description || `${pkg.name || path.basename(repoPath)} application`;
      defaults.repoType = 'active-app';
    } catch { /* ignore parse errors */ }
  }

  // Detect .NET projects
  const csprojFiles = fs.readdirSync(repoPath).filter(f => f.endsWith('.csproj') || f.endsWith('.sln') || f.endsWith('.slnx'));
  if (csprojFiles.length > 0) {
    defaults.techStack = '.NET';
    defaults.repoType = 'active-app';
  }

  // Detect Terraform
  const tfFiles = fs.readdirSync(repoPath).filter(f => f.endsWith('.tf'));
  if (tfFiles.length > 0) {
    defaults.techStack = 'Terraform';
    defaults.repoType = 'infrastructure';
  }

  return defaults;
}

const ENRICH_REQUIRED_SECTIONS = [
  'Architecture Overview',
  'Module or Service Map',
  'Data Flow Summary',
  'Authentication and Authorization',
  'Significant Changes (Last 90 Days)',
  'Technical Debt Relevant to Routing',
  'Performance Characteristics',
  'Known Failure Modes',
];

function runEnrichment(repoPath: string, slug: string, verify: boolean): void {
  if (!fs.existsSync(repoPath)) throw new Error(`path not found: ${repoPath}`);
  const conduitMdPath = path.join(repoPath, 'CONDUIT.md');
  const contextMdPath = path.join(repoPath, 'CONTEXT.md');
  if (!fs.existsSync(conduitMdPath)) throw new Error(`CONDUIT.md not found in ${repoPath}; run conduit init first`);
  if (!fs.existsSync(contextMdPath)) throw new Error(`CONTEXT.md not found in ${repoPath}; run conduit init first`);

  if (!verify) {
    console.log('CONDUIT REPO ENRICHMENT PROTOCOL');
    console.log(`Repo: ${slug}`);
    console.log(`Path: ${repoPath}`);
    console.log('');
    console.log(readEnrichmentProtocol());
    console.log('');
    console.log('After updating CONTEXT.md, run:');
    console.log(`  conduit init ${repoPath} --enrich --verify`);
    return;
  }

  const context = fs.readFileSync(contextMdPath, 'utf-8');
  const result = verifyContextEnrichment(context, repoPath);
  if (result.errors.length > 0) {
    throw new Error(`CONTEXT.md enrichment verification failed:\n  - ${result.errors.join('\n  - ')}`);
  }

  appendEnrichmentLog(repoPath, slug, result);
  refreshLastContextUpdate(conduitMdPath);
  storeSignalsHash(repoPath);
  console.log(`CONDUIT: CONTEXT.md enrichment verified for ${slug}`);
  console.log(`  sections: ${result.sections.length}`);
  console.log(`  evidence anchors: ${result.anchors.length}`);
  console.log(`  log: ${path.join(repoPath, '.conduit', 'enrichment-log.jsonl')}`);
}

interface EnrichmentVerificationResult {
  sections: string[];
  anchors: string[];
  errors: string[];
}

function verifyContextEnrichment(content: string, repoPath: string): EnrichmentVerificationResult {
  const errors: string[] = [];
  const sections: string[] = [];
  const anchors: string[] = [];
  const headings = [...content.matchAll(/^##\s+(.+?)\s*$/gm)].map(m => m[1].trim());
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const heading of headings) {
    const key = heading.toLowerCase();
    if (seen.has(key)) duplicates.add(heading);
    seen.add(key);
  }
  if (duplicates.size > 0) errors.push(`duplicate section headings: ${[...duplicates].join(', ')}`);

  for (const section of ENRICH_REQUIRED_SECTIONS) {
    const body = extractMarkdownSection(content, section);
    if (body === null) {
      errors.push(`missing required section: ${section}`);
      continue;
    }
    sections.push(section);
    const normalizedBody = body.trim();
    if (normalizedBody.length < 20) errors.push(`section is too sparse: ${section}`);
    if (/\bTODO\b|\bTBD\b/i.test(normalizedBody)) errors.push(`section still contains placeholder text: ${section}`);
  }

  for (const section of ['Module or Service Map', 'Known Failure Modes']) {
    const body = extractMarkdownSection(content, section) ?? '';
    const sectionAnchors = extractEvidenceAnchors(body).filter(anchor => anchorExists(repoPath, anchor));
    if (sectionAnchors.length === 0) {
      errors.push(`section lacks repo evidence anchors: ${section}`);
    } else {
      anchors.push(...sectionAnchors);
    }
  }

  return { sections, anchors: [...new Set(anchors)], errors };
}

function extractMarkdownSection(content: string, heading: string): string | null {
  const lines = content.split(/\r?\n/);
  const headingRe = /^##\s+(.+?)\s*$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRe);
    if (match && match[1].trim().toLowerCase() === heading.toLowerCase()) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (headingRe.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function extractEvidenceAnchors(content: string): string[] {
  return [...content.matchAll(/`([^`\r\n]+)`/g)]
    .map(m => m[1].trim())
    .filter(Boolean);
}

function anchorExists(repoPath: string, anchor: string): boolean {
  const cleaned = anchor
    .replace(/^\.\/+/, '')
    .replace(/:\d+(:\d+)?$/, '')
    .trim();
  if (!cleaned || cleaned.includes(' ') || /^[a-z]+:\/\//i.test(cleaned)) return false;
  return fs.existsSync(path.resolve(repoPath, cleaned));
}

function appendEnrichmentLog(repoPath: string, slug: string, result: EnrichmentVerificationResult): void {
  const logDir = path.join(repoPath, '.conduit');
  fs.mkdirSync(logDir, { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    repo: slug,
    verified: true,
    actor: currentActor(),
    sections: result.sections,
    evidence_anchors: result.anchors,
  };
  fs.appendFileSync(path.join(logDir, 'enrichment-log.jsonl'), JSON.stringify(entry) + '\n', 'utf-8');
}

function refreshLastContextUpdate(conduitMdPath: string): void {
  const today = todayISO();
  const content = fs.readFileSync(conduitMdPath, 'utf-8');
  if (!/last_context_update:\s*["']?[^"'\n]+["']?/.test(content)) {
    throw new Error('CONDUIT.md missing last_context_update; cannot refresh enrichment timestamp');
  }
  const next = content.replace(/last_context_update:\s*["']?[^"'\n]+["']?/, `last_context_update: "${today}"`);
  fs.writeFileSync(conduitMdPath, next, 'utf-8');
}

function readEnrichmentProtocol(): string {
  const protocolPath = findEnrichmentProtocolPath();
  if (!protocolPath) {
    return [
      'The enrichment protocol file is unavailable.',
      'Inspect the repo with grep/glob and git log, then update CONTEXT.md sections with concrete evidence anchors.',
      'Do not call an LLM or paste unsanitized external content into CONTEXT.md.',
    ].join('\n');
  }
  return fs.readFileSync(protocolPath, 'utf-8');
}

function findEnrichmentProtocolPath(): string | null {
  const conduitRoot = findConduitRoot();
  const installRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const candidates = [
    path.join(installRoot, 'directives', 'shared', 'enrichment-protocol.md'),
    path.join(process.cwd(), 'directives', 'shared', 'enrichment-protocol.md'),
    conduitRoot ? path.join(conduitRoot, 'directives', 'shared', 'enrichment-protocol.md') : '',
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

// ── Main ───────────────────────────────────────────────────────────

export async function runInit(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit init [repo-path] [--target | --global <path>] [--validate] [--enrich [--verify]]');
    console.log('');
    console.log('Highway Init — onboard repos into the Conduit network.');
    console.log('');
    console.log('Modes:');
    console.log('  (default)       Interactive questionnaire → generate CONDUIT.md, CONTEXT.md, QA_ACCEPTANCE.md');
    console.log('  --target        Mark a repo as a convoy TARGET — writes only CONDUIT.md');
    console.log('                  (CLI-4 / AC-21: never writes convoys/ in target repos)');
    console.log('  --global <path> Set the central conduit repo path in ~/.conduit/config.json');
    console.log('                  (CLI-4 / AC-21: required once per developer for central-only resolution)');
    console.log('  --scan          DEPRECATED alias of --target — will be removed in R2');
    console.log('  --upgrade       Migrate old-format CONDUIT.md to new format (preserves content)');
    console.log('  --validate      Validate existing highway documents');
    console.log('  --enrich        Print the repo enrichment protocol for an agent to update CONTEXT.md');
    console.log('  --verify        With --enrich, verify enriched CONTEXT.md and refresh last_context_update');
    console.log('');
    console.log('Files created in target repo:');
    console.log('  CONDUIT.md        Repo signals and agent rules');
    console.log('  CONTEXT.md        Living architecture summary (default mode only)');
    console.log('  QA_ACCEPTANCE.md  Quality acceptance registry (default mode only)');
    console.log('');
    return;
  }

  // ── CLI-4 / AC-21: --global <path> writes config.central ──
  const globalIdx = args.indexOf('--global');
  if (globalIdx !== -1) {
    const candidate = args[globalIdx + 1];
    if (!candidate) throw new Error('usage: conduit init --global <abs-path-to-conduit-repo>');
    const central = path.resolve(candidate);
    const registryPath = path.join(central, 'convoys', 'registry.yaml');
    if (!fs.existsSync(registryPath)) {
      throw new Error(`refusing to set central=${central}: ${registryPath} does not exist. Pass --force to override (not yet supported).`);
    }
    const force = args.includes('--force');
    const existing = readConfig();
    if (existing.central && existing.central !== central && !force) {
      throw new Error(`config.central already set to ${existing.central}. Re-run with --force to overwrite.`);
    }
    writeConfig({ ...existing, central });
    console.log(`CONDUIT: ~/.conduit/config.json central → ${central}`);
    return;
  }

  // ── --scan compatibility shim — alias of --target with deprecation warning ──
  let scanMode = args.includes('--scan');
  if (scanMode) {
    console.error('CONDUIT warn: --scan is deprecated and will be removed in R2 — use --target instead.');
  }
  const targetMode = args.includes('--target') || scanMode;
  const validateMode = args.includes('--validate');
  const upgradeMode = args.includes('--upgrade');
  const enrichMode = args.includes('--enrich');
  const verifyEnrichment = args.includes('--verify');
  const repoPath = path.resolve(args.filter(a => !a.startsWith('--'))[0] || '.');
  const slug = path.basename(repoPath);

  if (verifyEnrichment && !enrichMode) {
    throw new Error('usage: conduit init [repo-path] --enrich [--verify]');
  }

  if (enrichMode) {
    runEnrichment(repoPath, slug, verifyEnrichment);
    return;
  }

  // ── --target: write only CONDUIT.md, never convoys/ (AC-21) ──
  if (targetMode && !validateMode && !upgradeMode) {
    if (!fs.existsSync(repoPath)) throw new Error(`path not found: ${repoPath}`);
    const conduitMdPath = path.join(repoPath, 'CONDUIT.md');
    if (fs.existsSync(conduitMdPath) && !args.includes('--force')) {
      console.log(`CONDUIT: ${conduitMdPath} already exists — leaving it untouched.`);
    } else {
      const stub = generateConduitMd(slug, {
        purpose: 'target repo for one or more conduit convoys',
        repoType: 'active-app',
        techStack: '',
        liveUrl: '',
        workItem: '',
        owner: '',
        architect: '',
        security: '',
        neverDo: '',
        neverTouch: '',
        antiPatterns: '',
        dataRelationships: '',
      });
      fs.writeFileSync(conduitMdPath, stub, 'utf-8');
      console.log(`CONDUIT: wrote ${conduitMdPath} (target marker — convoys/ NOT created)`);
    }
    return;
  }

  if (!fs.existsSync(repoPath)) throw new Error(`path not found: ${repoPath}`);

  // Validate mode — delegate
  if (validateMode) {
    const conduitMdPath = path.join(repoPath, 'CONDUIT.md');
    if (!fs.existsSync(conduitMdPath)) throw new Error(`CONDUIT.md not found in ${repoPath}`);
    // Import and call validate inline
    console.log(`CONDUIT: Delegating to validate highway ${repoPath}`);
    const { runValidate } = await import('./validate.js');
    runValidate(['highway', repoPath]);
    return;
  }

  // Upgrade mode — migrate old-format CONDUIT.md to new format
  if (upgradeMode) {
    const existingPath = path.join(repoPath, 'CONDUIT.md');
    if (!fs.existsSync(existingPath)) {
      console.log(`CONDUIT: No existing CONDUIT.md — use conduit init --scan instead`);
      return;
    }

    console.log('\u2501'.repeat(62));
    console.log(`CONDUIT HIGHWAY UPGRADE — ${slug}`);
    console.log('\u2501'.repeat(62));
    console.log('');

    const oldContent = fs.readFileSync(existingPath, 'utf-8');

    // Check if already in new format
    if (oldContent.includes('## Repo Signals')) {
      console.log('CONDUIT: Already in new format — updating signals...');
      // Could add signal refresh logic here in future
      // For now, just validate
      const { runValidate } = await import('./validate.js');
      runValidate(['highway', repoPath]);
      return;
    }

    console.log('CONDUIT: Reading old CONDUIT.md...');

    // Extract what we can from old format
    const extracted = extractOldFormat(oldContent);

    // Merge with scan defaults
    const defaults = scanDefaults(repoPath);

    const answers: InitAnswers = {
      purpose: extracted.purpose || defaults.purpose || `${slug} repository`,
      repoType: extracted.repoType || defaults.repoType || 'active-app',
      techStack: extracted.techStack || defaults.techStack || 'TODO: confirm',
      liveUrl: extracted.liveUrl || '',
      workItem: extracted.workItem || '',
      owner: extracted.owner || defaults.owner || currentActor(),
      architect: extracted.architect || defaults.architect || currentActor(),
      security: extracted.security || defaults.security || currentActor(),
      neverDo: extracted.neverDo || '',
      neverTouch: extracted.neverTouch || '',
      antiPatterns: extracted.antiPatterns || '',
      dataRelationships: extracted.dataRelationships || '',
    };

    // Report what was extracted
    console.log('  Extracted from old CONDUIT.md:');
    if (extracted.purpose) console.log(`    Purpose: ${extracted.purpose.slice(0, 60)}`);
    if (extracted.repoType) console.log(`    Type: ${extracted.repoType}`);
    if (extracted.owner) console.log(`    Owner: ${extracted.owner}`);
    if (extracted.neverDo) console.log(`    Agent rules: preserved`);
    if (extracted.preservedSections.length > 0) console.log(`    Preserved sections: ${extracted.preservedSections.length}`);
    console.log('');

    // Back up old file
    const backupPath = existingPath + '.backup';
    fs.copyFileSync(existingPath, backupPath);
    console.log(`  \u2713 Backup: ${backupPath}`);

    // Generate new CONDUIT.md with preserved content
    let newContent = generateConduitMd(slug, answers);

    // Append preserved sections that didn't map to structured fields
    if (extracted.preservedSections.length > 0) {
      newContent += '\n## Additional Context (preserved from previous CONDUIT.md)\n\n';
      for (const section of extracted.preservedSections) {
        newContent += section + '\n\n';
      }
    }

    fs.writeFileSync(existingPath, newContent, 'utf-8');
    storeSignalsHash(repoPath);
    console.log(`  \u2713 CONDUIT.md upgraded to new format`);

    // Generate CONTEXT.md only if missing
    const contextPath = path.join(repoPath, 'CONTEXT.md');
    if (!fs.existsSync(contextPath)) {
      fs.writeFileSync(contextPath, generateContextMd(slug, answers), 'utf-8');
      console.log(`  \u2713 CONTEXT.md created`);
    } else {
      console.log(`  \u2139 CONTEXT.md already exists — preserved`);
    }

    // Generate QA_ACCEPTANCE.md only if missing
    const qaPath = path.join(repoPath, 'QA_ACCEPTANCE.md');
    if (!fs.existsSync(qaPath)) {
      fs.writeFileSync(qaPath, generateAcceptanceMd(slug, answers), 'utf-8');
      console.log(`  \u2713 QA_ACCEPTANCE.md created`);
    } else {
      console.log(`  \u2139 QA_ACCEPTANCE.md already exists — preserved`);
    }

    // Register in highway-index
    const conduitRoot = findConduitRoot();
    if (conduitRoot) {
      const indexEntryDir = path.join(conduitRoot, 'highway-index', 'repos');
      fs.mkdirSync(indexEntryDir, { recursive: true });
      const indexEntry = generateIndexEntry(slug, answers);
      const entryPath = path.join(indexEntryDir, `${slug}.yaml`);
      fs.writeFileSync(entryPath, indexEntry, 'utf-8');
      console.log(`  \u2713 highway-index/repos/${slug}.yaml`);

      // Update master index
      const masterIndexPath = path.join(conduitRoot, 'highway-index', 'index.yaml');
      if (fs.existsSync(masterIndexPath)) {
        let indexContent = fs.readFileSync(masterIndexPath, 'utf-8');
        if (!indexContent.includes(`entry: repos/${slug}.yaml`)) {
          // Add entry reference if slug exists but has no entry path
          const slugLine = indexContent.match(new RegExp(`(- slug: ${slug}\\n)(\\s+status:)`));
          if (slugLine) {
            indexContent = indexContent.replace(
              new RegExp(`(- slug: ${slug}\\n)(\\s+status:)`),
              `$1      entry: repos/${slug}.yaml\n$2`
            );
            fs.writeFileSync(masterIndexPath, indexContent, 'utf-8');
            console.log(`  \u2713 highway-index/index.yaml updated`);
          }
        }
      }
    }

    console.log('');
    console.log('\u2501'.repeat(62));
    console.log(`CONDUIT: Upgrade complete for ${slug}`);
    console.log('\u2501'.repeat(62));
    console.log('');
    console.log(`  Validate: conduit init ${repoPath} --validate`);
    console.log(`  Review:   ${existingPath}`);
    console.log(`  Backup:   ${backupPath}`);
    return;
  }

  // Check for existing CONDUIT.md
  const existingConduitMd = path.join(repoPath, 'CONDUIT.md');
  if (fs.existsSync(existingConduitMd)) {
    console.log(`CONDUIT: ${slug} already has CONDUIT.md`);
    console.log(`  To re-initialize, remove ${existingConduitMd} first`);
    console.log(`  To validate: conduit init ${repoPath} --validate`);
    return;
  }

  console.log('\u2501'.repeat(62));
  console.log(`CONDUIT HIGHWAY INIT — ${slug}`);
  console.log('\u2501'.repeat(62));
  console.log('');

  let answers: InitAnswers;

  if (scanMode) {
    // Non-interactive: scan and use defaults
    console.log('CONDUIT: Scanning codebase for defaults...');
    const defaults = scanDefaults(repoPath);
    answers = {
      purpose: defaults.purpose || `${slug} repository`,
      repoType: defaults.repoType || 'active-app',
      techStack: defaults.techStack || 'TODO: confirm',
      liveUrl: '',
      workItem: '',
      owner: defaults.owner || currentActor(),
      architect: defaults.architect || currentActor(),
      security: defaults.security || currentActor(),
      neverDo: '',
      neverTouch: '',
      antiPatterns: '',
      dataRelationships: '',
    };
    console.log(`  Purpose: ${answers.purpose}`);
    console.log(`  Type: ${answers.repoType}`);
    console.log(`  Stack: ${answers.techStack}`);
    console.log('');
  } else {
    // Interactive: ask the onboarding questions
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('Answer the following questions about this repo.');
    console.log('Press Enter to accept [defaults]. Type "skip" to use TODO placeholder.');
    console.log('');

    console.log('\u2500\u2500 Identity \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    const purpose = await ask(rl, 'Q1. Primary purpose (one sentence)', `${slug} application`);
    const repoType = await askChoice(rl, 'Q2. Repo type?',
      ['active-app', 'active-tool', 'shared-library', 'source-reference', 'poc', 'infrastructure', 'legacy', 'mainframe', 'unstarted', 'archived', 'test'],
      'active-app');
    const techStack = await ask(rl, 'Q3. Tech stack (framework + DB + auth + hosting)', '');
    const liveUrl = await ask(rl, 'Q4. Live URL (if any)', '');
    const workItem = await ask(rl, 'Q5. Work item or issue ID (if any)', '');

    console.log('');
    console.log('\u2500\u2500 Ownership \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    const owner = await ask(rl, 'Q6. Owner (name or team)', currentActor());
    const architect = await ask(rl, 'Q7. Who approves infra/pipeline changes?', owner);
    const security = await ask(rl, 'Q8. Security contact', owner);

    console.log('');
    console.log('\u2500\u2500 Agent Rules \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    const neverDo = await ask(rl, 'Q9. What should agents NEVER do? (comma-separated)', '');
    const neverTouch = await ask(rl, 'Q10. Files/dirs agents must not touch? (comma-separated)', '.env files, migration files already run');
    const antiPatterns = await ask(rl, 'Q11. Patterns from other repos that do NOT apply here?', '');

    console.log('');
    console.log('\u2500\u2500 Integration \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    const dataRelationships = await ask(rl, 'Q12. Cross-repo data dependencies?', '');

    rl.close();

    answers = {
      purpose,
      repoType,
      techStack,
      liveUrl,
      workItem,
      owner,
      architect,
      security,
      neverDo,
      neverTouch,
      antiPatterns,
      dataRelationships,
    };
  }

  // ── Generate files ───────────────────────────────────────────────
  console.log('CONDUIT: Generating highway documents...');

  const conduitMd = generateConduitMd(slug, answers);
  const contextMd = generateContextMd(slug, answers);
  const acceptanceMd = generateAcceptanceMd(slug, answers);

  fs.writeFileSync(path.join(repoPath, 'CONDUIT.md'), conduitMd, 'utf-8');
  storeSignalsHash(repoPath);
  console.log(`  \u2713 CONDUIT.md`);

  fs.writeFileSync(path.join(repoPath, 'CONTEXT.md'), contextMd, 'utf-8');
  console.log(`  \u2713 CONTEXT.md`);

  fs.writeFileSync(path.join(repoPath, 'QA_ACCEPTANCE.md'), acceptanceMd, 'utf-8');
  console.log(`  \u2713 QA_ACCEPTANCE.md`);

  // ── Register in highway index ────────────────────────────────────
  // Find conduit repo root (look for highway-index/)
  const conduitRoot = findConduitRoot();
  if (conduitRoot) {
    const indexEntryDir = path.join(conduitRoot, 'highway-index', 'repos');
    fs.mkdirSync(indexEntryDir, { recursive: true });

    const indexEntry = generateIndexEntry(slug, answers);
    const entryPath = path.join(indexEntryDir, `${slug}.yaml`);
    fs.writeFileSync(entryPath, indexEntry, 'utf-8');
    console.log(`  \u2713 highway-index/repos/${slug}.yaml`);

    // Update master index if entry not already present
    const masterIndexPath = path.join(conduitRoot, 'highway-index', 'index.yaml');
    if (fs.existsSync(masterIndexPath)) {
      let indexContent = fs.readFileSync(masterIndexPath, 'utf-8');
      if (!indexContent.includes(`slug: ${slug}`)) {
        const { operational_status } = mapRepoType(answers.repoType);
        const statusMap: Record<string, string> = {
          'ACTIVE': 'ACTIVE',
          'READ-ONLY': 'SOURCE-REFERENCE',
          'OBSERVE': 'ARCHIVED',
          'QUARANTINE': 'QUARANTINE',
        };
        const indexStatus = statusMap[operational_status] || 'ACTIVE';
        const newEntry = `    - slug: ${slug}\n      entry: repos/${slug}.yaml\n      status: ${indexStatus}\n      notes: "${answers.purpose.slice(0, 80)}"\n`;

        // Insert before the first comment section or at end of repos list
        const insertPoint = indexContent.lastIndexOf('\n    - slug:');
        if (insertPoint !== -1) {
          const nextNewline = indexContent.indexOf('\n', insertPoint + 1);
          // Find end of this entry block
          let endOfEntry = nextNewline;
          while (endOfEntry < indexContent.length) {
            const nextLine = indexContent.indexOf('\n', endOfEntry + 1);
            if (nextLine === -1) { endOfEntry = indexContent.length; break; }
            const line = indexContent.slice(endOfEntry + 1, nextLine);
            if (line.trim().startsWith('- slug:') || line.trim().startsWith('#') || !line.startsWith('      ')) {
              break;
            }
            endOfEntry = nextLine;
          }
          indexContent = indexContent.slice(0, endOfEntry + 1) + newEntry + indexContent.slice(endOfEntry + 1);
        }

        // Update total_repos count
        const repoCountMatch = indexContent.match(/total_repos:\s*(\d+)/);
        if (repoCountMatch) {
          const newCount = parseInt(repoCountMatch[1]) + 1;
          indexContent = indexContent.replace(/total_repos:\s*\d+/, `total_repos: ${newCount}`);
        }

        // Update last_full_sync
        indexContent = indexContent.replace(/last_full_sync:\s*"[^"]*"/, `last_full_sync: "${todayISO()}"`);

        fs.writeFileSync(masterIndexPath, indexContent, 'utf-8');
        console.log(`  \u2713 highway-index/index.yaml updated (${slug} added)`);
      } else {
        console.log(`  \u2139 highway-index/index.yaml already contains ${slug}`);
      }
    }
  } else {
    console.log(`  \u26a0 Conduit repo not found — skipping highway index registration`);
    console.log(`    Run from conduit repo or set --conduit-root to register`);
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log('');
  console.log('\u2501'.repeat(62));
  console.log(`CONDUIT: Highway Init complete for ${slug}`);
  console.log('\u2501'.repeat(62));
  console.log('');
  console.log('Files created:');
  console.log(`  ${path.join(repoPath, 'CONDUIT.md')}`);
  console.log(`  ${path.join(repoPath, 'CONTEXT.md')}`);
  console.log(`  ${path.join(repoPath, 'QA_ACCEPTANCE.md')}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Review CONDUIT.md — verify signals and agent rules`);
  console.log(`  2. Enrich CONTEXT.md — have an agent scan the codebase`);
  console.log(`  3. Validate: conduit init ${repoPath} --validate`);
  console.log(`  4. Commit the three files to the repo`);
}

// ── Upgrade mode: extract content from old-format CONDUIT.md ─────

interface ExtractedContent {
  purpose: string;
  repoType: string;
  techStack: string;
  liveUrl: string;
  workItem: string;
  owner: string;
  architect: string;
  security: string;
  neverDo: string;
  neverTouch: string;
  antiPatterns: string;
  dataRelationships: string;
  preservedSections: string[];
}

function extractOldFormat(content: string): ExtractedContent {
  const result: ExtractedContent = {
    purpose: '', repoType: '', techStack: '', liveUrl: '', workItem: '',
    owner: '', architect: '', security: '',
    neverDo: '', neverTouch: '', antiPatterns: '',
    dataRelationships: '',
    preservedSections: [],
  };

  // Try to extract operational_status from any YAML-like content
  const statusMatch = content.match(/operational_status:\s*(\S+)/i);
  if (statusMatch) {
    const status = statusMatch[1].toUpperCase();
    if (status === 'ACTIVE') result.repoType = 'active-app';
    else if (status === 'READ-ONLY') result.repoType = 'source-reference';
    else if (status === 'OBSERVE') result.repoType = 'archived';
  }

  // Extract purpose from first heading or status section
  const lines = content.split('\n').filter(l => l.trim());
  // First non-comment, non-heading line often has the purpose
  for (const line of lines) {
    if (line.startsWith('#') && !line.startsWith('##')) {
      // Top heading — often repo name, not purpose
      continue;
    }
    if (line.startsWith('<!--') || line.startsWith('-->') || line.startsWith('# ──')) continue;
    if (line.startsWith('## ')) continue;
    if (line.startsWith('```')) continue;
    if (line.trim().length > 10 && !line.startsWith('-') && !line.startsWith('|')) {
      result.purpose = line.trim().slice(0, 200);
      break;
    }
  }

  // Extract owner from escalation_contacts or "Owner" mentions
  const ownerMatch = content.match(/(?:escalation_contacts[\s\S]*?)?owner:\s*["']?([^"'\n]+)["']?/i);
  if (ownerMatch && ownerMatch[1].trim() !== 'HUMAN' && ownerMatch[1].trim() !== 'BOTH') {
    result.owner = ownerMatch[1].trim();
  }

  // Extract "What Agents Must Not Do" or similar
  const neverMatch = content.match(/(?:must\s*not|never|forbidden|prohibited)[^#]*?((?:- .+\n?)+)/i);
  if (neverMatch) {
    result.neverDo = neverMatch[1].trim().split('\n').map(l => l.replace(/^- /, '').trim()).join(', ');
  }

  // Extract sections that don't map to structured fields
  const sections = content.split(/^## /m).slice(1); // Skip content before first ##
  for (const section of sections) {
    const sectionTitle = section.split('\n')[0].trim();
    const sectionBody = section.split('\n').slice(1).join('\n').trim();

    // Skip sections we already handle
    const knownSections = ['Repo Signals', 'Status', 'What This Repo Is', 'What Agents May Do',
      'What Agents Must Not Do', 'Primary Audiences', 'Data Relationships'];
    if (knownSections.some(k => sectionTitle.toLowerCase().includes(k.toLowerCase()))) continue;

    if (sectionBody.length > 20) {
      result.preservedSections.push(`### ${sectionTitle}\n\n${sectionBody}`);
    }
  }

  // Extract tech stack hints
  const techMatch = content.match(/(?:tech.*stack|framework|built with)[:\s]*([^\n]+)/i);
  if (techMatch) result.techStack = techMatch[1].trim();

  // Extract work item / issue reference
  const workItemMatch = content.match(/(?:#|work\s*item|epic|feature|issue)\s*(\d{2,8})/i);
  if (workItemMatch) result.workItem = workItemMatch[1];

  return result;
}

// Find the conduit repo root by looking for highway-index/ directory
function findConduitRoot(): string | null {
  // Check common locations
  const candidates = [
    process.cwd(),
    path.resolve('.'),
    path.resolve('..', 'conduit'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'highway-index', 'index.yaml'))) {
      return candidate;
    }
  }
  return null;
}
