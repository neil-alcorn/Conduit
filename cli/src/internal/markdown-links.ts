// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/markdown-links.ts
// description: Pure-function markdown link extraction + audit-tree filtering.
//              Used by `conduit gate request` to enforce that every artifact
//              referenced from a gate-N-request.md is committed before the
//              CLI assembles the gate context bundle (CLI-1 / AC-2 / AC-4).
// owner:       BOTH
// update:      Manual when markdown-links contract changes.
// schema:      none
// last_update: 2026-04-30
// ─────────────────────────────────────────────────────────────────────

import path from 'node:path';

const FENCED_BACKTICK = /```[\s\S]*?```/g;
const FENCED_TILDE = /~~~[\s\S]*?~~~/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const INLINE_CODE_SPAN = /`[^`\n]*`/g;

// Inline link `[text](url)` — url has no spaces, no parens (avoids parens-in-URL
// false positives noted as a Stage 2 risk). Optional title `"…"` after a space.
const INLINE_LINK = /\[(?:[^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;

// Reference-style def `[label]: url` — anywhere in the doc on its own line.
const REFERENCE_DEF = /^\s*\[(?:[^\]]+)\]:\s*(\S+)/gm;

const ABSOLUTE_URL = /^[a-z][a-z0-9+\-.]*:\/\//i;

function stripFragmentAndQuery(link: string): string {
  let out = link;
  const hashIdx = out.indexOf('#');
  if (hashIdx >= 0) out = out.slice(0, hashIdx);
  const qIdx = out.indexOf('?');
  if (qIdx >= 0) out = out.slice(0, qIdx);
  return out;
}

/**
 * Extract every link target referenced by a markdown document, in document
 * order. Strips fenced code blocks (``` and ~~~), HTML comments, and single-
 * backtick inline code spans first so links inside them aren't treated as real
 * targets. Strips URL fragments and query strings from each result.
 *
 * Returns raw link target strings. Caller resolves to absolute paths and
 * filters by scope (see `filterAuditLinks`).
 */
export function extractMarkdownLinks(content: string): string[] {
  let cleaned = content;
  cleaned = cleaned.replace(FENCED_BACKTICK, '');
  cleaned = cleaned.replace(FENCED_TILDE, '');
  cleaned = cleaned.replace(HTML_COMMENT, '');
  cleaned = cleaned.replace(INLINE_CODE_SPAN, '');

  const links: string[] = [];

  let m: RegExpExecArray | null;
  INLINE_LINK.lastIndex = 0;
  while ((m = INLINE_LINK.exec(cleaned)) !== null) {
    links.push(m[1]);
  }

  REFERENCE_DEF.lastIndex = 0;
  while ((m = REFERENCE_DEF.exec(cleaned)) !== null) {
    links.push(m[1]);
  }

  return links.map(stripFragmentAndQuery).filter(s => s.length > 0);
}

/**
 * Filter raw link targets to those that resolve inside the convoy's audit
 * tree. Returns absolute paths.
 *
 * Drops:
 *   - empty strings,
 *   - bare anchors (`#section`),
 *   - absolute URLs (`https://`, `http://`, `mailto:` etc.),
 *   - paths that, when resolved relative to `requestFileDir`, fall outside
 *     `convoyAuditRoot` (e.g. `../../shared/x.md`).
 */
export function filterAuditLinks(
  links: string[],
  requestFileDir: string,
  convoyAuditRoot: string,
): string[] {
  const auditRoot = path.normalize(convoyAuditRoot);
  const out: string[] = [];
  for (const link of links) {
    if (!link) continue;
    if (link.startsWith('#')) continue;
    if (ABSOLUTE_URL.test(link)) continue;

    const abs = path.normalize(path.resolve(requestFileDir, link));
    const rel = path.relative(auditRoot, abs);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    out.push(abs);
  }
  return out;
}
