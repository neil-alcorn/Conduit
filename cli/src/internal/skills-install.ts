// CONDUIT MANAGED FILE
// file:        cli/src/internal/skills-install.ts
// description: Installs bundled Conduit workflow skills into agent-host skill
//              homes without deleting host-local files.
// owner:       BOTH
// update:      Manual when bundled skill installation behavior changes.
// schema:      none
// last_update: 2026-05-14

import fs from 'node:fs';
import path from 'node:path';
import { getBundledSkillInstallTargets, type AgentSkillInstallTarget } from './agent-host.js';

export interface BundledSkillInstallResult {
  target: AgentSkillInstallTarget;
  installed: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: string[];
}

export interface BundledAgentInstallResult {
  target: { host: AgentSkillInstallTarget['host']; label: string; agentsDir: string };
  installed: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: string[];
}

const BUNDLED_NON_PREFIXED_SKILLS = new Set(['session-wrap']);

function isBundledConduitSkillName(name: string): boolean {
  return name.startsWith('conduit-') || BUNDLED_NON_PREFIXED_SKILLS.has(name);
}

export function listBundledConduitSkills(repoPath: string): string[] {
  const bundledSkillsDir = path.join(repoPath, '.claude', 'skills');
  if (!fs.existsSync(bundledSkillsDir)) return [];

  return fs.readdirSync(bundledSkillsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(isBundledConduitSkillName)
    .filter(name => fs.existsSync(path.join(bundledSkillsDir, name, 'SKILL.md')))
    .sort();
}

export function syncBundledSkillsToTargets(
  repoPath: string,
  targets: AgentSkillInstallTarget[] = getBundledSkillInstallTargets(),
): BundledSkillInstallResult[] {
  const bundledSkillsDir = path.join(repoPath, '.claude', 'skills');
  const skillNames = listBundledConduitSkills(repoPath);

  return targets.map(target => {
    const result: BundledSkillInstallResult = {
      target,
      installed: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      errors: [],
    };

    if (!fs.existsSync(bundledSkillsDir)) {
      result.skipped = skillNames.length;
      result.errors.push('bundled skill source not found');
      return result;
    }

    for (const skillName of skillNames) {
      const src = path.join(bundledSkillsDir, skillName);
      const dest = path.join(target.skillsDir, skillName);

      try {
        const existed = fs.existsSync(dest);
        const copied = copyTreeIfChanged(src, dest, target);
        if (!existed) result.installed++;
        else if (copied > 0) result.updated++;
        else result.unchanged++;
      } catch (e: unknown) {
        result.skipped++;
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`${skillName}: ${msg}`);
      }
    }

    return result;
  });
}

export function adaptSkillMarkdownForHost(markdown: string, host: AgentSkillInstallTarget['host']): string {
  if (host !== 'codex') return markdown;
  return markdown
    .replaceAll('~/.claude/bin/conduit', 'conduit')
    .replaceAll("conduit repo's CLAUDE.md", "conduit repo's AGENTS.md")
    .replaceAll('Claude Code sessions', 'agent-host sessions')
    .replaceAll('Claude Code session', 'agent-host session')
    .replaceAll('Claude or a user', 'an agent or a user')
    .replaceAll('same mistake Claude keeps', 'same mistake the agent keeps')
    .replaceAll('CLAUDE.md addition', 'agent instruction addition')
    .replaceAll('`.claude/skills/*/SKILL.md`', '`~/.codex/skills/*/SKILL.md`')
    .replaceAll('`~/.claude/skills/`', '`~/.codex/skills/`')
    .replace(/^allowed-tools: (.*), Agent$/gm, 'allowed-tools: $1');
}

function copyTreeIfChanged(srcDir: string, destDir: string, target: AgentSkillInstallTarget): number {
  let copied = 0;
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copied += copyTreeIfChanged(src, dest, target);
      continue;
    }

    if (!entry.isFile()) continue;

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const nextContent = contentForTarget(src, target);
    if (!fs.existsSync(dest) || !nextContent.equals(fs.readFileSync(dest))) {
      fs.writeFileSync(dest, nextContent);
      copied++;
    }
  }

  return copied;
}

function contentForTarget(src: string, target: AgentSkillInstallTarget): Buffer {
  const original = fs.readFileSync(src);
  if (target.host !== 'codex' || !src.toLowerCase().endsWith('.md')) {
    return original;
  }

  const adapted = adaptSkillMarkdownForHost(original.toString('utf-8'), target.host);
  return Buffer.from(adapted, 'utf-8');
}

// ── Bundled Agent Sync ──────────────────────────────────────────────
// Parallel to skill sync but simpler: agents are flat .md files (not
// directories with SKILL.md inside).  Only conduit-* prefixed agents
// are synced; host-local agent files are never deleted.

export function listBundledConduitAgents(repoPath: string): string[] {
  const bundledAgentsDir = path.join(repoPath, '.claude', 'agents');
  if (!fs.existsSync(bundledAgentsDir)) return [];

  return fs.readdirSync(bundledAgentsDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => name.startsWith('conduit-') && name.endsWith('.md'))
    .sort();
}

export function syncBundledAgentsToTargets(
  repoPath: string,
  targets: AgentSkillInstallTarget[] = getBundledSkillInstallTargets(),
): BundledAgentInstallResult[] {
  const bundledAgentsDir = path.join(repoPath, '.claude', 'agents');
  const agentFiles = listBundledConduitAgents(repoPath);

  return targets.map(target => {
    // Derive agents dir from skillsDir by replacing trailing 'skills' with 'agents'
    const agentsDir = path.join(path.dirname(target.skillsDir), 'agents');
    const result: BundledAgentInstallResult = {
      target: { host: target.host, label: target.label, agentsDir },
      installed: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      errors: [],
    };

    if (!fs.existsSync(bundledAgentsDir) || agentFiles.length === 0) {
      result.skipped = agentFiles.length;
      if (agentFiles.length > 0) result.errors.push('bundled agent source not found');
      return result;
    }

    fs.mkdirSync(agentsDir, { recursive: true });

    for (const agentFile of agentFiles) {
      const src = path.join(bundledAgentsDir, agentFile);
      const dest = path.join(agentsDir, agentFile);

      try {
        const existed = fs.existsSync(dest);
        let srcContent = fs.readFileSync(src, 'utf-8');
        if (target.host === 'codex') {
          srcContent = adaptSkillMarkdownForHost(srcContent, target.host);
        }
        const srcBuffer = Buffer.from(srcContent, 'utf-8');

        if (!existed) {
          fs.writeFileSync(dest, srcBuffer);
          result.installed++;
        } else if (!srcBuffer.equals(fs.readFileSync(dest))) {
          fs.writeFileSync(dest, srcBuffer);
          result.updated++;
        } else {
          result.unchanged++;
        }
      } catch (e: unknown) {
        result.skipped++;
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`${agentFile}: ${msg}`);
      }
    }

    return result;
  });
}
