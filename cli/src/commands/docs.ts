// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/docs.ts
// description: `conduit docs` group. Currently exposes `tldr --check` /
//              `tldr --apply` to enforce the TL;DR convention on directive
//              markdown. TL;DR sits right after the managed-file comment
//              header and before the first body heading; agents read TL;DR
//              first and only load the full directive when they need detail.
// owner:       BOTH
// update:      Manual when convention or budget changes.
// schema:      none
// last_update: 2026-05-03
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { resolveRepoPath, resolveConvoyRoot } from '../utils.js';
import { estimateTokens } from '../internal/tokens.js';

const TLDR_HEADER = '## TL;DR';
const TLDR_BUDGET_TOKENS = 150;
const STUB_PLACEHOLDER = '_(TL;DR pending — replace with 2–4 bullet summary, ≤150 tokens. Cover: when this applies, what to do, what to avoid.)_';

interface TldrInspection {
  path: string;        // repo-relative
  hasTldr: boolean;
  tldrTokens: number;  // 0 when missing
  overBudget: boolean;
  isStub: boolean;     // present but still using placeholder
}

// Files we explicitly do NOT enforce TL;DR on. These are reference-only
// (humans, not agents) — adding TL;DR would be noise.
const ROOT_EXCLUDES = new Set(['CHANGELOG.md', 'INSTALL.md']);

function walkMd(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const out: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (!e.name.startsWith('.')) stack.push(full);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Markdown surfaces an agent reads during normal operation:
 *   - Root: CONDUIT.md, CLAUDE.md, CONTEXT.md, README.md (skipping CHANGELOG / INSTALL)
 *   - directives/** — every directive
 *   - standards/** — referenced by directives and the `decompose` flow
 *
 * Convoy artifacts (living-spec, gate-context-N.md) are deliberately out of
 * scope: they are short-lived and bespoke per convoy. Use `conduit doc-budget`
 * for those.
 */
function scanAgentDocs(repoRoot: string): string[] {
  const out: string[] = [];
  // Root markdowns
  for (const f of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    if (!f.isFile() || !f.name.endsWith('.md')) continue;
    if (ROOT_EXCLUDES.has(f.name)) continue;
    out.push(path.join(repoRoot, f.name));
  }
  // directives/** and standards/**
  out.push(...walkMd(path.join(repoRoot, 'directives')));
  out.push(...walkMd(path.join(repoRoot, 'standards')));
  return out;
}

/**
 * Extract the TL;DR block. Returns the body (between `## TL;DR` and the next
 * heading) or null if absent.
 */
function extractTldr(content: string): string | null {
  const lines = content.split('\n');
  const headerIdx = lines.findIndex(l => l.trim() === TLDR_HEADER);
  if (headerIdx < 0) return null;
  const body: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (/^#{1,6} /.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n').trim();
}

function inspect(repoRoot: string, file: string): TldrInspection {
  const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf-8');
  const tldr = extractTldr(content);
  if (tldr === null) {
    return { path: rel, hasTldr: false, tldrTokens: 0, overBudget: false, isStub: false };
  }
  const tokens = estimateTokens(tldr);
  return {
    path: rel,
    hasTldr: true,
    tldrTokens: tokens,
    overBudget: tokens > TLDR_BUDGET_TOKENS,
    isStub: tldr.includes('TL;DR pending'),
  };
}

/**
 * Find the right insertion line for the TL;DR header. Skips the leading
 * managed-file HTML comment (if present) and any blank lines, lands right
 * before the first body heading or content line.
 */
function findInsertionLine(content: string): number {
  const lines = content.split('\n');
  let i = 0;

  // Skip leading managed-file comment block (`<!-- ... -->`)
  if (lines[i]?.trim().startsWith('<!--')) {
    while (i < lines.length && !lines[i].includes('-->')) i++;
    i++; // past the closing `-->`
  }

  // Skip the optional blank line directly after the comment.
  while (i < lines.length && lines[i].trim() === '') i++;

  return i;
}

function applyStub(file: string): boolean {
  const content = fs.readFileSync(file, 'utf-8');
  if (extractTldr(content) !== null) return false; // already has one
  const lines = content.split('\n');
  const idx = findInsertionLine(content);
  const block = ['## TL;DR', STUB_PLACEHOLDER, ''];
  const next = [...lines.slice(0, idx), ...block, ...lines.slice(idx)].join('\n');
  fs.writeFileSync(file, next, 'utf-8');
  return true;
}

export async function runDocs(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit docs <tldr> [--check|--apply]');
    console.log('');
    console.log('  tldr --check    Report directives missing or over-budget on TL;DR');
    console.log('  tldr --apply    Scaffold a TL;DR stub into directives missing one');
    return;
  }

  if (args[0] !== 'tldr') {
    throw new Error(`unknown docs subcommand: ${args[0]}`);
  }

  const rest = args.slice(1);
  const { remaining, repoPath } = resolveRepoPath(rest);
  const convoyRepoPath = resolveConvoyRoot(repoPath);

  const mode = remaining.includes('--apply') ? 'apply'
             : remaining.includes('--check') ? 'check'
             : 'check';
  const wantJson = remaining.includes('--json');

  const files = scanAgentDocs(convoyRepoPath);
  if (files.length === 0) {
    console.log(`No agent-loaded markdown found under ${convoyRepoPath}`);
    return;
  }

  if (mode === 'apply') {
    let added = 0;
    const skipped: string[] = [];
    for (const f of files) {
      const inserted = applyStub(f);
      if (inserted) added++;
      else skipped.push(path.relative(convoyRepoPath, f).replace(/\\/g, '/'));
    }
    console.log(`CONDUIT: TL;DR stubs scaffolded — ${added} added, ${skipped.length} already had one`);
    console.log('Replace `_(TL;DR pending ...)_` placeholders with real summaries.');
    return;
  }

  // check mode
  const results = files.map(f => inspect(convoyRepoPath, f));
  const missing = results.filter(r => !r.hasTldr);
  const stubs = results.filter(r => r.isStub);
  const over = results.filter(r => r.overBudget);

  if (wantJson) {
    console.log(JSON.stringify({
      budget_tokens: TLDR_BUDGET_TOKENS,
      total: results.length,
      missing_count: missing.length,
      stub_count: stubs.length,
      over_budget_count: over.length,
      results,
    }, null, 2));
    return;
  }

  console.log('# TL;DR Lint');
  console.log('');
  console.log(`Scanned: ${results.length} agent-loaded markdown files (root, directives/, standards/)`);
  console.log(`Budget per TL;DR: ${TLDR_BUDGET_TOKENS} tokens`);
  console.log('');

  if (missing.length === 0 && stubs.length === 0 && over.length === 0) {
    console.log('All directives have a real TL;DR within budget. ✓');
    return;
  }

  if (missing.length > 0) {
    console.log(`## Missing TL;DR (${missing.length})`);
    for (const r of missing) console.log(`- ${r.path}`);
    console.log('');
  }
  if (stubs.length > 0) {
    console.log(`## Stub placeholders still in place (${stubs.length})`);
    for (const r of stubs) console.log(`- ${r.path}`);
    console.log('');
  }
  if (over.length > 0) {
    console.log(`## Over budget (>${TLDR_BUDGET_TOKENS} tokens)`);
    for (const r of over) console.log(`- ${r.path} — ~${r.tldrTokens} tokens`);
    console.log('');
  }

  const remediation: string[] = [];
  if (missing.length > 0) remediation.push('`conduit docs tldr --apply` to scaffold missing TL;DRs (replace placeholders by hand)');
  if (stubs.length > 0) remediation.push('Replace remaining `_(TL;DR pending ...)_` placeholders');
  if (over.length > 0) remediation.push('Trim over-budget TL;DRs to ≤150 tokens (~4 short bullets)');
  if (remediation.length > 0) {
    console.log('## Next steps');
    for (const r of remediation) console.log(`- ${r}`);
  }
}
