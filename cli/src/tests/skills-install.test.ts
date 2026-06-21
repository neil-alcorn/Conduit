// CONDUIT MANAGED FILE
// file:        cli/src/tests/skills-install.test.ts
// description: Tests for host-aware bundled Conduit skill installation.
// owner:       BOTH
// update:      Manual when bundled skill installation behavior changes.
// schema:      none
// last_update: 2026-05-14

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBundledSkillsToTargets, syncBundledAgentsToTargets } from '../internal/skills-install.js';
import { detectAgentHost } from '../internal/agent-host.js';

interface SavedEnv {
  userProfile?: string;
  home?: string;
  agentHost?: string;
  agentName?: string;
  codexHome?: string;
}

function withEnv(home: string, fn: () => void): void {
  const saved: SavedEnv = {
    userProfile: process.env['USERPROFILE'],
    home: process.env['HOME'],
    agentHost: process.env['CONDUIT_AGENT_HOST'],
    agentName: process.env['CONDUIT_AGENT_NAME'],
    codexHome: process.env['CODEX_HOME'],
  };

  process.env['USERPROFILE'] = home;
  process.env['HOME'] = home;
  delete process.env['CONDUIT_AGENT_HOST'];
  delete process.env['CONDUIT_AGENT_NAME'];
  delete process.env['CODEX_HOME'];

  try {
    fn();
  } finally {
    if (saved.userProfile !== undefined) process.env['USERPROFILE'] = saved.userProfile;
    else delete process.env['USERPROFILE'];
    if (saved.home !== undefined) process.env['HOME'] = saved.home;
    else delete process.env['HOME'];
    if (saved.agentHost !== undefined) process.env['CONDUIT_AGENT_HOST'] = saved.agentHost;
    else delete process.env['CONDUIT_AGENT_HOST'];
    if (saved.agentName !== undefined) process.env['CONDUIT_AGENT_NAME'] = saved.agentName;
    else delete process.env['CONDUIT_AGENT_NAME'];
    if (saved.codexHome !== undefined) process.env['CODEX_HOME'] = saved.codexHome;
    else delete process.env['CODEX_HOME'];
  }
}

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-skills-repo-'));
  const skillDir = path.join(repo, '.claude', 'skills', 'conduit-context');
  fs.mkdirSync(path.join(skillDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: conduit-context\nallowed-tools: Bash, Agent\n---\n\nRun: ~/.claude/bin/conduit context\nFollow the conduit repo\'s CLAUDE.md\n', 'utf-8');
  fs.writeFileSync(path.join(skillDir, 'assets', 'prompt.md'), 'Use conduit context.\n', 'utf-8');
  return repo;
}

describe('syncBundledSkillsToTargets', () => {
  it('syncs bundled conduit skills to existing Claude and Codex homes without deleting extras', () => {
    const repo = makeRepo();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-skills-home-'));
    const claudeHome = path.join(home, '.claude');
    const codexHome = path.join(home, '.codex');
    fs.mkdirSync(path.join(claudeHome, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(codexHome, 'skills', 'conduit-context'), { recursive: true });
    fs.writeFileSync(path.join(codexHome, 'skills', 'conduit-context', 'LOCAL.md'), 'do not delete\n', 'utf-8');

    try {
      withEnv(home, () => {
        const results = syncBundledSkillsToTargets(repo);
        assert.equal(results.length, 2);
        assert.ok(fs.existsSync(path.join(claudeHome, 'skills', 'conduit-context', 'SKILL.md')));
        assert.ok(fs.existsSync(path.join(codexHome, 'skills', 'conduit-context', 'SKILL.md')));
        assert.ok(fs.existsSync(path.join(codexHome, 'skills', 'conduit-context', 'assets', 'prompt.md')));
        assert.ok(fs.existsSync(path.join(codexHome, 'skills', 'conduit-context', 'LOCAL.md')));
        const codexSkill = fs.readFileSync(path.join(codexHome, 'skills', 'conduit-context', 'SKILL.md'), 'utf-8');
        assert.match(codexSkill, /Run: conduit context/);
        assert.match(codexSkill, /AGENTS\.md/);
        assert.doesNotMatch(codexSkill, /~\/\.claude\/bin\/conduit/);
        assert.doesNotMatch(codexSkill, /Agent$/m);
      });
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('creates the Codex skill home when Codex is the active host', () => {
    const repo = makeRepo();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-skills-home-'));

    try {
      withEnv(home, () => {
        process.env['CONDUIT_AGENT_HOST'] = 'codex';
        const results = syncBundledSkillsToTargets(repo);
        assert.equal(results.length, 1);
        assert.equal(results[0].target.host, 'codex');
        assert.equal(results[0].installed, 1);
        assert.ok(fs.existsSync(path.join(home, '.codex', 'skills', 'conduit-context', 'SKILL.md')));
      });
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

function makeRepoWithAgents(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-agents-repo-'));
  const agentsDir = path.join(repo, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(path.join(agentsDir, 'conduit-ui-researcher.md'), '---\nname: conduit-ui-researcher\n---\nResearcher agent.\n', 'utf-8');
  fs.writeFileSync(path.join(agentsDir, 'conduit-ui-checker.md'), '---\nname: conduit-ui-checker\n---\nChecker agent.\n', 'utf-8');
  return repo;
}

describe('syncBundledAgentsToTargets', () => {
  it('syncs conduit-*.md agent files to target agents dir without deleting non-conduit files', () => {
    const repo = makeRepoWithAgents();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-agents-home-'));
    const claudeAgents = path.join(home, '.claude', 'agents');
    fs.mkdirSync(claudeAgents, { recursive: true });
    fs.writeFileSync(path.join(claudeAgents, 'my-custom-agent.md'), 'do not delete\n', 'utf-8');

    try {
      withEnv(home, () => {
        const results = syncBundledAgentsToTargets(repo);
        assert.ok(results.length >= 1);
        const claudeResult = results.find(r => r.target.host === 'claude');
        assert.ok(claudeResult);
        assert.equal(claudeResult.installed, 2);
        assert.ok(fs.existsSync(path.join(claudeAgents, 'conduit-ui-researcher.md')));
        assert.ok(fs.existsSync(path.join(claudeAgents, 'conduit-ui-checker.md')));
        assert.ok(fs.existsSync(path.join(claudeAgents, 'my-custom-agent.md')));
        assert.equal(fs.readFileSync(path.join(claudeAgents, 'my-custom-agent.md'), 'utf-8'), 'do not delete\n');
      });
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('returns zero counts when no bundled agents directory exists', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-agents-empty-'));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-agents-home-'));

    try {
      withEnv(home, () => {
        const results = syncBundledAgentsToTargets(repo);
        for (const r of results) {
          assert.equal(r.installed, 0);
          assert.equal(r.updated, 0);
          assert.equal(r.skipped, 0);
        }
      });
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('reports unchanged when agent content has not changed', () => {
    const repo = makeRepoWithAgents();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-agents-home-'));

    try {
      withEnv(home, () => {
        syncBundledAgentsToTargets(repo);
        const results = syncBundledAgentsToTargets(repo);
        const claudeResult = results.find(r => r.target.host === 'claude');
        assert.ok(claudeResult);
        assert.equal(claudeResult.installed, 0);
        assert.equal(claudeResult.unchanged, 2);
      });
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('detectAgentHost', () => {
  it('detects Codex from an existing .codex home when no Claude home or env hint exists', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-agent-host-home-'));
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });

    try {
      withEnv(home, () => {
        const detected = detectAgentHost();
        assert.equal(detected.host, 'codex');
        assert.equal(detected.source, 'existing-home:.codex');
      });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
