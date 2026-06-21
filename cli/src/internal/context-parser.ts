// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/context-parser.ts
// description: Headless CONTEXT block parsing + validation. YAML is the
//              default input format; JSON is auto-detected when the trimmed
//              input starts with `{` or `[` (Stage-2 heuristic — no new
//              dependency). Malformed input throws InvalidContextError
//              (exit 3 / AC-13); a missing required field throws
//              MissingContextFieldError naming the FIRST gap (exit 3 / AC-3).
// owner:       BOTH
// update:      Manual when the CONTEXT block contract changes.
// schema:      none
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import yaml from 'js-yaml';
import { MissingContextFieldError, setHeadlessContext } from './headless-io.js';

/** The CONTEXT block could not be parsed at all. index.ts maps this to
 *  exit 3 with `{"error":"invalid-context","details":...}` (AC-13). */
export class InvalidContextError extends Error {
  readonly details: string;

  constructor(details: string) {
    super(`invalid CONTEXT block: ${details}`);
    this.name = 'InvalidContextError';
    this.details = details;
  }
}

/** Per-command required-field declaration, colocated at the top of each
 *  command file (Stage-2 decision — no central registry). */
export interface ContextSchema {
  required: string[];
  command: string;
}

/**
 * Parse a raw CONTEXT block. JSON when the trimmed input starts with `{` or
 * `[`; YAML otherwise. Throws InvalidContextError carrying the underlying
 * parser message on malformed or empty input.
 */
export function parseContextBlock(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new InvalidContextError('empty CONTEXT block — expected YAML or JSON on stdin');
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch (err: any) {
      throw new InvalidContextError(err.message ?? 'JSON parse failure');
    }
  }

  try {
    return yaml.load(trimmed);
  } catch (err: any) {
    throw new InvalidContextError(err.message ?? 'YAML parse failure');
  }
}

/**
 * Validate a parsed CONTEXT block against a command's schema. Returns the
 * typed mapping on success. Non-mapping input (scalar/array/null) throws
 * InvalidContextError; a missing/empty required field throws
 * MissingContextFieldError naming the FIRST missing field, in schema order.
 */
export function validateContext(parsed: unknown, schema: ContextSchema): Record<string, unknown> {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidContextError(
      `CONTEXT block for '${schema.command}' must be a mapping/object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
    );
  }

  const ctx = parsed as Record<string, unknown>;
  for (const field of schema.required) {
    const value = ctx[field];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      throw new MissingContextFieldError(field);
    }
  }

  // Stage-5 finding SEC-M2: convoy_id flows into path.join(...,'convoys',
  // 'active', convoyId) and, on `plan init`, into mkdir/write — a traversal
  // payload ("../..", absolute path) would escape the convoy tree. Reject
  // anything that is not a plain single-segment name.
  const cid = ctx['convoy_id'];
  if (typeof cid === 'string' && (cid === '.' || cid === '..' || !/^[A-Za-z0-9._-]+$/.test(cid))) {
    throw new InvalidContextError(
      `convoy_id must be a single path segment (letters, digits, dot, dash, underscore) — got ${JSON.stringify(cid)}`,
    );
  }

  return ctx;
}

/** CONTEXT blocks are small structured documents; anything bigger is a
 *  mis-piped artifact (Stage-5 finding SEC-M3 — unbounded read = OOM). */
export const MAX_CONTEXT_BYTES = 1_048_576;

/** Read stdin synchronously in bounded chunks (the CONTEXT block arrives as
 *  a single document piped by the CI step — fd 0 read-to-EOF). Aborts with
 *  InvalidContextError once MAX_CONTEXT_BYTES is exceeded rather than
 *  buffering an arbitrarily large pipe into memory. */
export function readStdinSync(): string {
  const chunks: Buffer[] = [];
  let total = 0;
  const buf = Buffer.alloc(65536);
  for (;;) {
    let n = 0;
    try {
      n = fs.readSync(0, buf, 0, buf.length, null);
    } catch (e: any) {
      if (e.code === 'EAGAIN') continue; // non-blocking stdin momentarily empty
      if (e.code === 'EOF') break;      // Windows pipe end-of-stream
      throw e;
    }
    if (n === 0) break;
    total += n;
    if (total > MAX_CONTEXT_BYTES) {
      throw new InvalidContextError(
        `CONTEXT block exceeds ${MAX_CONTEXT_BYTES} bytes — refusing to read further (is the right file piped?)`,
      );
    }
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The one call every headless command makes at entry: read the CONTEXT block
 * from stdin, parse (YAML/JSON), validate against the command's schema, stash
 * it for prompt() resolution, and return it. An interactive terminal (TTY
 * stdin — nothing piped) is treated as an empty CONTEXT block rather than
 * blocking on EOF that will never come.
 */
export function loadHeadlessContext(schema: ContextSchema): Record<string, unknown> {
  let raw = '';
  if (!process.stdin.isTTY) {
    try {
      raw = readStdinSync();
    } catch (e) {
      // The size-cap refusal (SEC-M3) must surface as its own exit-3 message,
      // not collapse into "empty CONTEXT block".
      if (e instanceof InvalidContextError) throw e;
      raw = '';
    }
  }
  const ctx = validateContext(parseContextBlock(raw), schema);
  setHeadlessContext(ctx);
  return ctx;
}

/**
 * Backfill the convoy-id positional (args[1], right after the subcommand)
 * from the CONTEXT block when argv omits it. argv wins when both are present
 * — CI steps that already pass `conduit plan init my-convoy` keep working
 * unchanged. Safe with flags: parseFlagValue scans positionally-independent,
 * so inserting before `--title x` / `--repo p` does not disturb them.
 */
export function backfillConvoyArg(args: string[], convoyId: string): string[] {
  if (args.length === 0) return args;
  if (args[1] === undefined || args[1].startsWith('--')) {
    return [args[0], convoyId, ...args.slice(1)];
  }
  return args;
}
