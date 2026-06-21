// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/doc-budget.ts
// description: Audit token cost of context-loaded docs (CONDUIT.md, CLAUDE.md,
//              directives, active convoy artifacts). Surfaces over-budget
//              files so we know where context-rot lives in numbers, not
//              guesses. Read-only — no commits, no events.
// owner:       BOTH
// update:      Manual when budget thresholds or scan paths change.
// schema:      none
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { resolveRepoPath, resolveConvoyRoot } from '../utils.js';
import { estimateFileTokens } from '../internal/tokens.js';

interface BudgetCategory {
  name: string;
  budget: number;       // soft cap per file (tokens)
  scan: (root: string) => string[];  // returns absolute paths
}

const DEFAULT_BUDGETS = {
  directive: 3000,
  rootDoc: 5000,        // CONDUIT.md, CLAUDE.md
  gateContext: 8000,    // convoys/active/<id>/audit/gate-context-N.md
  convoyArtifact: 4000, // anything else under convoys/active/<id>/
};

function walkMd(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        out.push(full);
      }
    }
  }
  return out;
}

function categories(repoPath: string): BudgetCategory[] {
  return [
    {
      name: 'root-doc',
      budget: DEFAULT_BUDGETS.rootDoc,
      scan: () => ['CONDUIT.md', 'CLAUDE.md']
        .map(f => path.join(repoPath, f))
        .filter(p => fs.existsSync(p)),
    },
    {
      name: 'directive',
      budget: DEFAULT_BUDGETS.directive,
      scan: () => walkMd(path.join(repoPath, 'directives')),
    },
    {
      name: 'gate-context',
      budget: DEFAULT_BUDGETS.gateContext,
      scan: () => {
        const activeDir = path.join(repoPath, 'convoys', 'active');
        if (!fs.existsSync(activeDir)) return [];
        const out: string[] = [];
        for (const convoy of fs.readdirSync(activeDir)) {
          const auditDir = path.join(activeDir, convoy, 'audit');
          if (!fs.existsSync(auditDir)) continue;
          for (const f of fs.readdirSync(auditDir)) {
            if (f.startsWith('gate-context-') && f.endsWith('.md')) {
              out.push(path.join(auditDir, f));
            }
          }
        }
        return out;
      },
    },
    {
      name: 'convoy-artifact',
      budget: DEFAULT_BUDGETS.convoyArtifact,
      scan: () => {
        const activeDir = path.join(repoPath, 'convoys', 'active');
        if (!fs.existsSync(activeDir)) return [];
        const out: string[] = [];
        for (const convoy of fs.readdirSync(activeDir)) {
          const convoyDir = path.join(activeDir, convoy);
          if (!fs.statSync(convoyDir).isDirectory()) continue;
          for (const f of walkMd(convoyDir)) {
            // gate-context already covered above; skip to avoid double-count.
            if (f.includes(`${path.sep}audit${path.sep}gate-context-`)) continue;
            out.push(f);
          }
        }
        return out;
      },
    },
  ];
}

interface FileEntry {
  category: string;
  budget: number;
  path: string;
  tokens: number;
  overBudget: boolean;
}

export async function runDocBudget(args: string[]): Promise<void> {
  const { remaining, repoPath } = resolveRepoPath(args);
  const convoyRepoPath = resolveConvoyRoot(repoPath);

  const wantJson = remaining.includes('--json');
  const onlyOver = remaining.includes('--over-budget');
  const limitArg = remaining.indexOf('--limit');
  const limit = limitArg >= 0 && remaining[limitArg + 1] ? parseInt(remaining[limitArg + 1], 10) : 50;

  const cats = categories(convoyRepoPath);
  const entries: FileEntry[] = [];
  for (const cat of cats) {
    for (const file of cat.scan(convoyRepoPath)) {
      const tokens = estimateFileTokens(file);
      if (tokens === 0) continue; // missing / unreadable
      const rel = path.relative(convoyRepoPath, file).replace(/\\/g, '/');
      entries.push({
        category: cat.name,
        budget: cat.budget,
        path: rel,
        tokens,
        overBudget: tokens > cat.budget,
      });
    }
  }

  // Sort: over-budget first, then largest first.
  entries.sort((a, b) => {
    if (a.overBudget !== b.overBudget) return a.overBudget ? -1 : 1;
    return b.tokens - a.tokens;
  });

  const filtered = onlyOver ? entries.filter(e => e.overBudget) : entries;
  const shown = filtered.slice(0, limit);

  if (wantJson) {
    console.log(JSON.stringify({
      budgets: DEFAULT_BUDGETS,
      total_files: entries.length,
      over_budget_count: entries.filter(e => e.overBudget).length,
      total_tokens: entries.reduce((s, e) => s + e.tokens, 0),
      entries: shown,
    }, null, 2));
    return;
  }

  console.log('# Doc Budget Audit');
  console.log('');
  console.log(`Scanned: ${entries.length} markdown files under ${convoyRepoPath}`);
  console.log(`Budgets: directive ${DEFAULT_BUDGETS.directive} · root-doc ${DEFAULT_BUDGETS.rootDoc} · gate-context ${DEFAULT_BUDGETS.gateContext} · convoy-artifact ${DEFAULT_BUDGETS.convoyArtifact}`);
  console.log('');

  if (entries.length === 0) {
    console.log('_No markdown files found in scan paths._');
    return;
  }

  console.log('| Status | Tokens | Budget | Category        | Path |');
  console.log('|--------|--------|--------|-----------------|------|');
  for (const e of shown) {
    const status = e.overBudget ? '[OVER]' : '[OK]  ';
    const tok = String(e.tokens).padStart(6);
    const bud = String(e.budget).padStart(6);
    const cat = e.category.padEnd(15);
    console.log(`| ${status} | ${tok} | ${bud} | ${cat} | ${e.path} |`);
  }

  console.log('');
  const overCount = entries.filter(e => e.overBudget).length;
  const totalTokens = entries.reduce((s, e) => s + e.tokens, 0);
  console.log(`**Summary** — ${overCount} over budget · ${entries.length} total · ~${(totalTokens / 1000).toFixed(1)}k tokens across all files`);
  if (filtered.length > shown.length) {
    console.log(`(showing top ${shown.length} of ${filtered.length}; pass \`--limit N\` to see more)`);
  }
}
