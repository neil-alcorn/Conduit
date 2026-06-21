// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/tokens.ts
// description: Token estimation for context budgeting. Enables agents to
//              gauge context window cost before loading full content.
// owner:       BOTH
// update:      Manual when estimation heuristic changes.
// schema:      none
// last_update: 2026-04-18
// ─────────────────────────────────────────────────────────────────────

/**
 * Estimate token count for a text string.
 *
 * Uses a ~4 characters per token heuristic — accurate enough for context
 * budgeting decisions (load full vs. summarize). Not a tokenizer.
 *
 * Inspired by Cloudflare's x-markdown-tokens header concept: give agents
 * the information they need to manage context window pressure.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Format a token count for display: "~1.2k tokens" or "~340 tokens".
 */
export function formatTokens(count: number): string {
  if (count >= 1000) {
    return `~${(count / 1000).toFixed(1)}k tokens`;
  }
  return `~${count} tokens`;
}

/**
 * Estimate tokens for a file on disk. Returns 0 if the file doesn't exist.
 */
export function estimateFileTokens(filePath: string): number {
  try {
    const { readFileSync } = require('node:fs');
    const content = readFileSync(filePath, 'utf-8');
    return estimateTokens(content);
  } catch {
    return 0;
  }
}
