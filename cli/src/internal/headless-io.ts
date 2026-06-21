// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/headless-io.ts
// description: Single choke point for headless (--headless) mode. Holds the
//              module-level headless singleton + the parsed CONTEXT block,
//              and exports prompt() — the readPrompt wrapper every command
//              should call instead of readPrompt directly. Interactive mode
//              delegates to readPrompt unchanged; headless mode resolves
//              from the CONTEXT block or throws MissingContextFieldError
//              (mapped to exit 3 by index.ts). Never prompts in headless.
// owner:       BOTH
// update:      Manual when the headless input contract changes.
// schema:      none
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import { readPrompt } from '../utils.js';

/** A required input field was absent from the headless CONTEXT block.
 *  index.ts maps this to exit code 3 with a JSON error naming the field. */
export class MissingContextFieldError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`missing required context field: ${field}`);
    this.name = 'MissingContextFieldError';
    this.field = field;
  }
}

// Module-level singleton — set once by index.ts arg parsing, read everywhere.
// Commands never thread the flag through call sites (Stage-2 design decision).
let _headless = false;
let _context: Record<string, unknown> = {};

export function setHeadless(v: boolean): void {
  _headless = v;
}

export function isHeadless(): boolean {
  return _headless;
}

/** Stash the parsed CONTEXT block (stdin YAML/JSON) so prompt() can resolve
 *  fields without re-reading stdin. Commands call this once after parsing. */
export function setHeadlessContext(ctx: Record<string, unknown>): void {
  _context = ctx;
}

export function getHeadlessContext(): Record<string, unknown> {
  return _context;
}

/** Normalize a human prompt label to a context-key shape:
 *  "Convoy ID" → "convoy_id". Lets CONTEXT blocks use snake_case keys while
 *  call sites keep their human-readable labels. */
function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * The readPrompt replacement. Interactive mode delegates to readPrompt
 * (behavior unchanged, modulo the optional default applied to empty input).
 * Headless mode NEVER prompts: it resolves the label against the stashed
 * CONTEXT block (exact key first, then normalized), falls back to
 * opts.default when declared, and otherwise throws MissingContextFieldError
 * — index.ts converts that to the exit-3 JSON error document (AC-3).
 */
export async function prompt(label: string, opts?: { default?: string }): Promise<string> {
  if (_headless) {
    const exact = _context[label];
    if (exact !== undefined && exact !== null) return String(exact);

    const normalized = _context[normalizeLabel(label)];
    if (normalized !== undefined && normalized !== null) return String(normalized);

    if (opts?.default !== undefined) return opts.default;
    throw new MissingContextFieldError(normalizeLabel(label));
  }

  const answer = await readPrompt(label);
  if (answer === '' && opts?.default !== undefined) return opts.default;
  return answer;
}
