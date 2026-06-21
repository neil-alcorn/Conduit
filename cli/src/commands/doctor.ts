// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/doctor.ts
// description: conduit doctor — repo/git/build/identity health snapshot.
// owner:       BOTH
// update:      Manual when new health signals are added.
// schema:      none
// last_update: 2026-04-23
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { resolveRepoPath, resolveConvoyRoot } from '../utils.js';
import { analyzeShimCmd } from '../internal/bootstrap.js';
import {
  isGitRepo,
  currentBranch,
  upstreamBranch,
  countCommits,
  workingTreeStatus,
  configEmail,
} from '../internal/git-sync.js';
import { bold, cyan, dim, gray } from '../internal/ui.js';
import { agentHostLabel, getAgentHostPaths, getBundledSkillInstallTargets, hostWorkflowSurface } from '../internal/agent-host.js';
import { listBundledConduitSkills } from '../internal/skills-install.js';
import { daysSince, formatReenrichmentOffer, STALE_DAYS } from '../internal/staleness.js';

type Status = 'ok' | 'warn' | 'fail' | 'info';

interface Check {
  label: string;
  status: Status;
  detail: string;
}

function marker(s: Status): string {
  switch (s) {
    case 'ok':   return cyan('✓');
    case 'warn': return '⚠';
    case 'fail': return '✗';
    case 'info': return dim('·');
  }
}

function runCheck(label: string, fn: () => Check | null): Check | null {
  try {
    return fn();
  } catch (e: any) {
    return { label, status: 'warn', detail: `check errored: ${e.message ?? 'unknown'}` };
  }
}

function gitCheck(repoPath: string): Check[] {
  const out: Check[] = [];

  if (!isGitRepo(repoPath)) {
    out.push({ label: 'git repo', status: 'info', detail: `${repoPath} is not a git repo — skipping git checks` });
    return out;
  }

  const branch = currentBranch(repoPath);
  out.push({
    label: 'current branch',
    status: branch ? 'ok' : 'warn',
    detail: branch ?? 'detached HEAD',
  });

  const upstream = upstreamBranch(repoPath);
  if (!upstream) {
    out.push({ label: 'upstream', status: 'warn', detail: 'no upstream tracking branch configured — commands will work but push cannot auto-sync' });
  } else {
    out.push({ label: 'upstream', status: 'ok', detail: upstream });

    const ahead = countCommits(repoPath, `${upstream}..HEAD`);
    const behind = countCommits(repoPath, `HEAD..${upstream}`);
    if (ahead === 0 && behind === 0) {
      out.push({ label: 'sync vs upstream', status: 'ok', detail: 'in sync' });
    } else if (ahead > 0 && behind === 0) {
      out.push({ label: 'sync vs upstream', status: 'warn', detail: `${ahead} local commit${ahead === 1 ? '' : 's'} not pushed — run 'git push'` });
    } else if (ahead === 0 && behind > 0) {
      out.push({ label: 'sync vs upstream', status: 'warn', detail: `${behind} remote commit${behind === 1 ? '' : 's'} not pulled — run 'git pull --ff-only'` });
    } else {
      out.push({
        label: 'sync vs upstream',
        status: 'fail',
        detail: `DIVERGED — ${ahead} local-only, ${behind} remote-only. Mutating commands will refuse. Recover: git pull --rebase  (or see 'conduit doctor --help')`,
      });
    }
  }

  const status = workingTreeStatus(repoPath);
  if (status === null) {
    out.push({ label: 'working tree', status: 'warn', detail: 'could not inspect working tree — git status failed' });
  } else {
    const dirty = status.length > 0;
    out.push({
      label: 'working tree',
      status: dirty ? 'warn' : 'ok',
      detail: dirty ? 'has uncommitted changes' : 'clean',
    });
  }

  const email = configEmail(repoPath);
  if (email) {
    out.push({ label: 'git identity', status: 'ok', detail: `user.email = ${email}` });
  } else {
    out.push({ label: 'git identity', status: 'warn', detail: 'no user.email set — commits will fail' });
  }

  return out;
}

function buildFreshnessCheck(repoPath: string): Check | null {
  const srcDir = path.join(repoPath, 'cli', 'src');
  const distEntry = path.join(repoPath, 'dist', 'cli', 'src', 'index.js');
  const srcEntry = path.join(srcDir, 'index.ts');

  if (!fs.existsSync(srcEntry)) {
    // Not a conduit checkout — skip
    return null;
  }

  if (!fs.existsSync(distEntry)) {
    return {
      label: 'cli build',
      status: 'warn',
      detail: `no built artifact at ${path.relative(repoPath, distEntry)} — run 'npm run build'`,
    };
  }

  const distMtime = fs.statSync(distEntry).mtimeMs;
  let newestSrcMtime = 0;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'tests' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && full.endsWith('.ts')) {
        const m = fs.statSync(full).mtimeMs;
        if (m > newestSrcMtime) newestSrcMtime = m;
      }
    }
  };

  try {
    walk(srcDir);
  } catch {
    return { label: 'cli build', status: 'info', detail: 'src walk failed — cannot compare' };
  }

  if (newestSrcMtime > distMtime) {
    const diff = Math.round((newestSrcMtime - distMtime) / 1000);
    return {
      label: 'cli build',
      status: 'warn',
      detail: `dist is ${diff}s older than newest src — run 'npm run build'`,
    };
  }

  return { label: 'cli build', status: 'ok', detail: 'up to date' };
}

function nodeVersionCheck(): Check {
  const v = process.version;
  const major = parseInt(v.replace(/^v/, '').split('.')[0], 10);
  if (major >= 20) return { label: 'node version', status: 'ok', detail: v };
  return { label: 'node version', status: 'warn', detail: `${v} — conduit targets Node 20+` };
}

function registryCheck(repoPath: string): Check {
  const regPath = path.join(repoPath, 'convoys', 'registry.yaml');
  if (!fs.existsSync(regPath)) {
    return { label: 'registry', status: 'info', detail: `no registry.yaml at ${path.relative(repoPath, regPath)} (ok if not a conduit checkout)` };
  }
  const mtime = fs.statSync(regPath).mtimeMs;
  const ageMin = Math.round((Date.now() - mtime) / 60000);
  return { label: 'registry', status: 'ok', detail: `found, last modified ${ageMin} min ago` };
}

function contextFreshnessCheck(repoPath: string): Check | null {
  const conduitMd = path.join(repoPath, 'CONDUIT.md');
  if (!fs.existsSync(conduitMd)) return null;
  const content = fs.readFileSync(conduitMd, 'utf-8');
  const lastUpdate = content.match(/last_context_update:\s*["']?([^"'\n]+)["']?/)?.[1]?.trim();
  const age = daysSince(lastUpdate);
  const offer = formatReenrichmentOffer(lastUpdate, repoPath);
  if (!offer) {
    return {
      label: 'context freshness',
      status: 'ok',
      detail: `last_context_update ${lastUpdate ?? 'unknown'} (${age} day${age === 1 ? '' : 's'} ago)`,
    };
  }
  return {
    label: 'context freshness',
    status: 'warn',
    detail: `last_context_update ${lastUpdate || 'missing'} is stale (${age === Infinity ? 'unknown age' : `${age} days`}, threshold ${STALE_DAYS}); ${offer}`,
  };
}

function identityHintCheck(): Check {
  return { label: 'identity hint', status: 'info', detail: 'actor resolves from the OS username' };
}

function convoyModeCheck(repoPath: string): Check | null {
  const activeDir = path.join(repoPath, 'convoys', 'active');
  if (!fs.existsSync(activeDir)) return null;
  const convoyDirs = fs.readdirSync(activeDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template');
  if (convoyDirs.length === 0) return null;

  const lines: string[] = [];
  for (const dir of convoyDirs) {
    const yamlPath = path.join(activeDir, dir.name, 'convoy.yaml');
    if (!fs.existsSync(yamlPath)) continue;
    try {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      const statusMatch = content.match(/^status:\s*(\S+)/m);
      const stageMatch = content.match(/^stage:\s*(\d+)/m);
      const status = statusMatch?.[1] ?? 'unknown';
      const stage = stageMatch?.[1] ?? '0';
      lines.push(`${dir.name} — status: ${status}  stage: ${stage}`);
    } catch (e: any) {
      lines.push(`${dir.name} — ⚠ ${e.message}`);
    }
  }
  if (lines.length === 0) return null;
  return { label: 'convoy mode', status: 'info', detail: lines.join('\n        ') };
}

function agentHostChecks(repoPath: string): Check[] {
  const hostPaths = getAgentHostPaths();
  const bundledSkills = listBundledConduitSkills(repoPath);
  const targets = getBundledSkillInstallTargets();
  const checks: Check[] = [{
    label: 'active agent host',
    status: 'ok',
    detail: `${agentHostLabel(hostPaths.host)} via ${hostPaths.source}; workflows: ${hostWorkflowSurface(hostPaths.host)}`,
  }];

  if (bundledSkills.length === 0) {
    checks.push({ label: 'bundled skills', status: 'warn', detail: 'no bundled conduit-* skills found in repo .claude/skills/' });
  } else {
    checks.push({ label: 'bundled skills', status: 'ok', detail: `${bundledSkills.length} conduit-* skill(s) available in repo` });
  }

  if (targets.length === 0) {
    checks.push({ label: 'skill homes', status: 'warn', detail: 'no Claude/Codex skill home detected; run with CONDUIT_AGENT_HOST=codex or launch from the host' });
  }

  for (const target of targets) {
    const installed = bundledSkills
      .filter(name => fs.existsSync(path.join(target.skillsDir, name, 'SKILL.md')))
      .length;
    const missing = bundledSkills.length - installed;
    checks.push({
      label: `${target.label.toLowerCase()} skills`,
      status: missing === 0 ? 'ok' : 'warn',
      detail: `${installed}/${bundledSkills.length} bundled skill(s) at ${target.skillsDir}${missing > 0 ? " — run 'conduit context' to sync" : ''}`,
    });
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? '';
    const candidates = [
      localAppData ? path.join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe') : '',
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    ].filter(Boolean);
    const found = candidates.find(p => fs.existsSync(p));
    checks.push({
      label: 'git bash',
      status: found ? 'ok' : 'warn',
      detail: found ? `${found}` : 'not found in standard Windows Git locations; shell hooks may fail',
    });
  }

  return checks;
}

// ── Install health ──────────────────────────────────────────────────
// The first-install verifier: a new developer should be able to run
// `conduit doctor` after the install script and trust that all-green
// means the shims are wired and `conduit` resolves in every shell.
function installHealthChecks(_repoPath: string): Check[] {
  const checks: Check[] = [];

  // Shim presence + health
  const binDir = path.join(homedir(), '.claude', 'bin');
  const bashShim = path.join(binDir, 'conduit');
  checks.push(fs.existsSync(bashShim)
    ? { label: 'bash shim', status: 'ok', detail: bashShim }
    : { label: 'bash shim', status: 'warn', detail: `missing at ${bashShim} — any conduit command rewrites it (bootstrap)` });

  if (process.platform === 'win32') {
    const cmdShim = path.join(binDir, 'conduit.cmd');
    if (!fs.existsSync(cmdShim)) {
      checks.push({ label: 'cmd shim', status: 'warn', detail: `missing at ${cmdShim} — any conduit command rewrites it (bootstrap)` });
    } else {
      const health = analyzeShimCmd(fs.readFileSync(cmdShim, 'utf-8'));
      if (!health.crlfOnly) {
        checks.push({ label: 'cmd shim', status: 'fail', detail: `${cmdShim} has LF line endings — cmd.exe will print spurious errors. Run any conduit command once to self-heal (rewrites the shim).` });
      } else if (!health.currentVersion) {
        checks.push({ label: 'cmd shim', status: 'warn', detail: `${cmdShim} is an older shim version — run any conduit command once to self-heal.` });
      } else {
        checks.push({ label: 'cmd shim', status: 'ok', detail: `${cmdShim} (CRLF, current version)` });
      }
    }
  }

  // PATH — plain `conduit` should resolve in every shell.
  const norm = (p: string) => p.trim().replace(/[\\/]+$/, '').toLowerCase();
  const onPath = (process.env.PATH ?? '')
    .split(path.delimiter)
    .some(p => p && norm(p) === norm(binDir));
  checks.push(onPath
    ? { label: 'shim on PATH', status: 'ok', detail: `${binDir} is on PATH — plain 'conduit' works in every shell` }
    : {
        label: 'shim on PATH',
        status: 'warn',
        detail: `${binDir} not on PATH. Until then: PowerShell/cmd use ~/.claude/bin/conduit.cmd, Git Bash uses ~/.claude/bin/conduit.\n        Fix: re-run scripts\\install-conduit.cmd (or .sh) — it registers the PATH entry; then open a new terminal.`,
      });

  return checks;
}

function formatSection(title: string, checks: Check[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(bold(title));
  lines.push(gray('─'.repeat(Math.max(title.length, 40))));
  for (const c of checks) {
    if (!c) continue;
    lines.push(`  ${marker(c.status)} ${c.label.padEnd(22)} ${c.detail}`);
  }
  return lines.join('\n');
}

export async function runDoctor(args: string[]): Promise<void> {
  const { repoPath: rawPath } = resolveRepoPath(args);
  const repoPath = resolveConvoyRoot(rawPath);

  console.log('');
  console.log(bold(cyan('CONDUIT Doctor')));
  console.log(gray(`  path: ${repoPath}`));

  const gitChecks = gitCheck(repoPath);
  console.log(formatSection('Git & Sync', gitChecks));

  const runtime: Check[] = [nodeVersionCheck(), identityHintCheck()];
  const buildC = runCheck('cli build', () => buildFreshnessCheck(repoPath));
  if (buildC) runtime.push(buildC);
  console.log(formatSection('Runtime', runtime));

  const inventory: Check[] = [registryCheck(repoPath)];
  const freshnessCheck = runCheck('context freshness', () => contextFreshnessCheck(repoPath));
  if (freshnessCheck) inventory.push(freshnessCheck);
  const modeCheck = runCheck('convoy mode', () => convoyModeCheck(repoPath));
  if (modeCheck) inventory.push(modeCheck);
  console.log(formatSection('Inventory', inventory));

  const agentChecks = agentHostChecks(repoPath);
  console.log(formatSection('Agent Host', agentChecks));

  const installChecks = installHealthChecks(repoPath);
  console.log(formatSection('Install', installChecks));

  // Surface a single-line summary for quick scanning
  const all = [...gitChecks, ...runtime, ...inventory, ...agentChecks, ...installChecks];
  const fails = all.filter((c) => c?.status === 'fail').length;
  const warns = all.filter((c) => c?.status === 'warn').length;
  console.log('');
  if (fails > 0) {
    console.log(bold(`  ${fails} fail · ${warns} warn — resolve failures before running mutating commands.`));
    process.exitCode = 1;
  } else if (warns > 0) {
    console.log(bold(`  0 fail · ${warns} warn — you can run conduit commands; warnings are informational.`));
  } else {
    console.log(bold(`  all clear`));
  }
  console.log('');
}
