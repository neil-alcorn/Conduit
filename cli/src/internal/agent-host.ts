// —— CONDUIT MANAGED FILE ————————————————————————————————————————————————
// file:        cli/src/internal/agent-host.ts
// description: Resolves the active agent host and its user-home integration
//              paths. Keeps Conduit host-aware without spreading `.claude`
//              assumptions throughout the CLI.
// owner:       BOTH
// update:      Manual when host contracts or path conventions change.
// schema:      none
// last_update: 2026-05-14
// —————————————————————————————————————————————————————————————————————————

import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

export type AgentHost = 'claude' | 'codex' | 'neutral';
export type AgentHostSource = 'env:CONDUIT_AGENT_HOST' | 'env:CONDUIT_AGENT_NAME' | 'env:CODEX_HOME' | 'existing-home:.claude' | 'existing-home:.codex' | 'default';

export interface AgentHostPaths {
  host: AgentHost;
  source: AgentHostSource;
  hostHome: string;
  skillsDir: string;
  rulesDir: string;
  statePath: string;
  claudeMdPath: string;
  shimDir: string;
}

export interface AgentSkillInstallTarget {
  host: Exclude<AgentHost, 'neutral'>;
  label: string;
  hostHome: string;
  skillsDir: string;
  active: boolean;
  reason: string;
}

function normalizedEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function userHome(): string {
  return normalizedEnv('USERPROFILE') || normalizedEnv('HOME') || homedir();
}

export function detectAgentHost(): { host: AgentHost; source: AgentHostSource } {
  const explicit = normalizedEnv('CONDUIT_AGENT_HOST').toLowerCase();
  if (explicit === 'claude' || explicit === 'codex' || explicit === 'neutral') {
    return { host: explicit, source: 'env:CONDUIT_AGENT_HOST' };
  }

  const branded = normalizedEnv('CONDUIT_AGENT_NAME').toLowerCase();
  if (branded.includes('codex')) return { host: 'codex', source: 'env:CONDUIT_AGENT_NAME' };
  if (branded.includes('claude')) return { host: 'claude', source: 'env:CONDUIT_AGENT_NAME' };

  if (normalizedEnv('CODEX_HOME')) return { host: 'codex', source: 'env:CODEX_HOME' };

  const home = userHome();
  const claudeHome = path.join(home, '.claude');
  const codexHome = path.join(home, '.codex');
  const hasClaudeHome = fs.existsSync(claudeHome);
  const hasCodexHome = fs.existsSync(codexHome);

  if (hasCodexHome && !hasClaudeHome) return { host: 'codex', source: 'existing-home:.codex' };
  if (hasClaudeHome && !hasCodexHome) return { host: 'claude', source: 'existing-home:.claude' };

  return { host: 'claude', source: 'default' };
}

export function agentHostLabel(host: AgentHost): string {
  switch (host) {
    case 'claude': return 'Claude';
    case 'codex': return 'Codex';
    case 'neutral': return 'Neutral';
  }
}

export function hostWorkflowSurface(host: AgentHost): string {
  switch (host) {
    case 'claude': return '.claude/skills/';
    case 'codex': return '~/.codex/skills/ + AGENTS.md';
    case 'neutral': return 'AGENTS.md + conduit CLI';
  }
}

export function getAgentHostPaths(): AgentHostPaths {
  const detected = detectAgentHost();
  const userHomePath = userHome();
  const claudeHome = path.join(userHomePath, '.claude');
  const codexHome = normalizedEnv('CODEX_HOME') || path.join(userHomePath, '.codex');
  const neutralHome = path.join(userHomePath, '.conduit');

  const hostHome = detected.host === 'claude'
    ? claudeHome
    : detected.host === 'codex'
      ? codexHome
      : neutralHome;

  return {
    host: detected.host,
    source: detected.source,
    hostHome,
    skillsDir: path.join(hostHome, 'skills'),
    rulesDir: detected.host === 'neutral'
      ? path.join(hostHome, 'rules')
      : path.join(hostHome, 'conduit-rules'),
    statePath: detected.host === 'neutral'
      ? path.join(hostHome, 'state', 'last-seen.json')
      : path.join(hostHome, 'conduit-state', 'last-seen.json'),
    claudeMdPath: path.join(claudeHome, 'CLAUDE.md'),
    shimDir: path.join(claudeHome, 'bin'),
  };
}

export function shouldBootstrapClaude(): boolean {
  return detectAgentHost().host === 'claude';
}

export function getBundledSkillInstallTargets(): AgentSkillInstallTarget[] {
  const active = getAgentHostPaths();
  const userHomePath = userHome();
  const claudeHome = path.join(userHomePath, '.claude');
  const codexHome = normalizedEnv('CODEX_HOME') || path.join(userHomePath, '.codex');
  const targets: AgentSkillInstallTarget[] = [];
  const seen = new Set<string>();

  const add = (target: AgentSkillInstallTarget): void => {
    const key = path.resolve(target.skillsDir).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(target);
  };

  if (active.host === 'claude' || active.host === 'codex') {
    add({
      host: active.host,
      label: agentHostLabel(active.host),
      hostHome: active.hostHome,
      skillsDir: active.skillsDir,
      active: true,
      reason: `active host (${active.source})`,
    });
  }

  if (fs.existsSync(claudeHome)) {
    add({
      host: 'claude',
      label: 'Claude',
      hostHome: claudeHome,
      skillsDir: path.join(claudeHome, 'skills'),
      active: active.host === 'claude',
      reason: 'existing ~/.claude home',
    });
  }

  if (normalizedEnv('CODEX_HOME') || fs.existsSync(codexHome)) {
    add({
      host: 'codex',
      label: 'Codex',
      hostHome: codexHome,
      skillsDir: path.join(codexHome, 'skills'),
      active: active.host === 'codex',
      reason: normalizedEnv('CODEX_HOME') ? 'CODEX_HOME configured' : 'existing ~/.codex home',
    });
  }

  return targets;
}
