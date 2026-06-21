// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/learn.ts
// description: Record a proposed skill or rule learning. Claude (or a human)
//              composes the content in-session, then calls this command to
//              file the proposal as a DRAFT in the remote registry — the human
//              approval gate stays intact. Sources the content from a file and
//              posts to the appropriate API.
// owner:       BOTH
// update:      Manual as the self-learning surface evolves.
// schema:      none
// last_update: 2026-04-23
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveRepoPath, parseFlagValue, currentActor } from '../utils.js';
import { readConduitConfig } from '../internal/config.js';
import { sanitize } from '../internal/sanitizer.js';
import { estimateTokens } from '../internal/tokens.js';

type LearningKind = 'skill' | 'rule';

export async function runLearn(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit learn <skill|rule> --name <id> --title <title> [--description <d>] --content-file <path> [--source <url-or-ref> | --evidence <ref>] [--convoy <id>] [--rule-kind <k>]');
    console.log('');
    console.log('Files a DRAFT learning (skill or rule) in the registry for human review.');
    console.log('');
    console.log('Required:');
    console.log('  kind             Positional: "skill" or "rule"');
    console.log('  --name           Unique identifier (slug for skill, path-key for rule)');
    console.log('  --title          Human-readable title');
    console.log('  --content-file   Path to the markdown file containing the proposed content');
    console.log('');
    console.log('Optional:');
    console.log('  --description    One-line summary');
    console.log('  --source         Provenance: URL, article ref, session id, etc. Captured in description.');
    console.log('  --evidence       Required provenance evidence: artifact path, session id, URL, or commit ref.');
    console.log('  --convoy         Source convoy id when a convoy produced the learning.');
    console.log('  --rule-kind      For rule kind only: directive|standard|claudemd|conduit_md|highway|other');
    console.log('                   Defaults to "other".');
    console.log('');
    console.log('Learnings land as status=draft. An admin must approve in the registry before');
    console.log('they become installable by other users.');
    return;
  }

  const kindArg = args[0];
  if (kindArg !== 'skill' && kindArg !== 'rule') {
    throw new Error(`conduit learn: first argument must be "skill" or "rule" (got "${kindArg}")`);
  }
  const kind: LearningKind = kindArg;

  const { remaining, repoPath } = resolveRepoPath(args.slice(1));

  const { value: name } = parseFlagValue(remaining, '--name');
  const { value: title } = parseFlagValue(remaining, '--title');
  const { value: description } = parseFlagValue(remaining, '--description');
  const { value: contentFile } = parseFlagValue(remaining, '--content-file');
  const { value: source } = parseFlagValue(remaining, '--source');
  const { value: convoy } = parseFlagValue(remaining, '--convoy');
  const { value: evidenceFlag } = parseFlagValue(remaining, '--evidence');
  const { value: ruleKind } = parseFlagValue(remaining, '--rule-kind');

  if (!name) throw new Error('conduit learn: --name is required');
  if (!title) throw new Error('conduit learn: --title is required');
  if (!contentFile) throw new Error('conduit learn: --content-file is required');

  const absContent = path.isAbsolute(contentFile) ? contentFile : path.resolve(process.cwd(), contentFile);
  if (!fs.existsSync(absContent)) throw new Error(`conduit learn: content file not found: ${absContent}`);
  const rawContent = fs.readFileSync(absContent, 'utf-8');
  const sanitized = sanitize(`learn_${kind}`, rawContent, repoPath);
  if (!sanitized.allowed) {
    throw new Error(`CONDUIT: learn ${kind} content blocked by sanitizer: ${sanitized.matches.join(', ')}`);
  }
  const content = sanitized.sanitized;

  if (kind === 'skill' && name.startsWith('repo-')) {
    const tokens = estimateTokens(content);
    if (tokens > 2000) {
      throw new Error(`CONDUIT: repo-* skill drafts are limited to 2000 tokens (estimated ${tokens})`);
    }
  }

  const evidence = (evidenceFlag || source || '').trim();
  if (!evidence) {
    throw new Error('conduit learn: --evidence or --source is required for provenance');
  }

  const cfg = resolveRegistryConfig(repoPath);
  if (!cfg) return;

  const ownerEmail = process.env['USER'] || process.env['USERNAME'] || 'unknown';
  const provenance: LearningProvenance = {
    proposer: currentActor(),
    proposerRole: process.env['CONDUIT_ROLE'] || process.env['CONDUIT_AGENT_HOST'] || 'unknown',
    sourceRepo: path.basename(repoPath),
    sourceConvoy: convoy || undefined,
    evidence,
    source: source || undefined,
  };
  const provenanceSuffix = ` [evidence: ${evidence}${source ? `; source: ${source}` : ''}]`;
  const finalDescription = (description || 'Proposed by conduit learn') + provenanceSuffix;

  if (kind === 'skill') {
    await postSkillDraft(cfg, { name, title, description: finalDescription, content, ownerEmail, repoSlug: path.basename(repoPath), provenance });
  } else {
    await postRuleDraft(cfg, {
      name,
      kind: (ruleKind && ['directive', 'standard', 'claudemd', 'conduit_md', 'highway', 'other'].includes(ruleKind)) ? ruleKind : 'other',
      title,
      description: finalDescription,
      path: name,
      content,
      ownerEmail,
      provenance,
    });
  }
}

interface LearningProvenance {
  proposer: string;
  proposerRole: string;
  sourceRepo: string;
  sourceConvoy?: string;
  evidence: string;
  source?: string;
}

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
    console.log('CONDUIT: CONDUIT_REGISTRY_URL and CONDUIT_REGISTRY_API_KEY required for learn');
    return null;
  }
  return { baseUrl, apiKey };
}

interface SkillDraft {
  name: string;
  title: string;
  description: string;
  content: string;
  ownerEmail: string;
  repoSlug: string;
  provenance: LearningProvenance;
}

async function postSkillDraft(cfg: { baseUrl: string; apiKey: string }, d: SkillDraft): Promise<void> {
  const res = await fetch(`${cfg.baseUrl}/api/conduit/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      name: d.name,
      description: d.description,
      content: d.content,
      scope: 'shared',
      ownerEmail: d.ownerEmail,
      repoSlug: d.repoSlug,
      provenance: d.provenance,
      status: 'draft',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as Record<string, unknown>;
    console.log(`CONDUIT: skill draft rejected — ${err['error'] ?? res.statusText}`);
    return;
  }
  const data = await res.json() as { action: string; skill: { id: string } };
  console.log(`CONDUIT: skill ${data.action} as draft — ${d.name} (id: ${data.skill.id})`);
  console.log('  Admin review required in the registry before other users can install it.');
}

interface RuleDraft {
  name: string;
  kind: string;
  title: string;
  description: string;
  path: string;
  content: string;
  ownerEmail: string;
  provenance: LearningProvenance;
}

async function postRuleDraft(cfg: { baseUrl: string; apiKey: string }, d: RuleDraft): Promise<void> {
  const contentHash = crypto.createHash('sha256').update(d.content, 'utf-8').digest('hex');
  const res = await fetch(`${cfg.baseUrl}/api/conduit/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      name: d.name,
      kind: d.kind,
      title: d.title,
      description: d.description,
      path: d.path,
      content: d.content,
      contentHash,
      ownerEmail: d.ownerEmail,
      provenance: d.provenance,
      status: 'draft',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as Record<string, unknown>;
    console.log(`CONDUIT: rule draft rejected — ${err['error'] ?? res.statusText}`);
    return;
  }
  const data = await res.json() as { action: string; rule: { id: string } };
  console.log(`CONDUIT: rule ${data.action} as draft — ${d.name} (id: ${data.rule.id})`);
  console.log('  Admin review required in the registry before it joins the canonical rule set.');
}
