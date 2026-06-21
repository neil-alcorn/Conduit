// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/headless-output.ts
// description: Headless output contract (AC-2/9/10/14). stdout carries
//              exactly one JSON document per invocation (result envelope or
//              error envelope); stderr carries one-line JSON events for CI
//              log collectors — never plain text. Each helper returns the
//              serialized string it wrote so callers/tests can reuse it.
// owner:       BOTH
// update:      Manual when the headless output envelope changes.
// schema:      none
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

export interface HeadlessResultPayload {
  command: string;
  convoy_id?: string;
  verdict: 'SUCCESS' | 'SEND_BACK' | 'ERROR';
  artifacts?: string[];
  [k: string]: unknown;
}

// Tracks whether THIS process already wrote its single stdout document, so
// index.ts can emit a fallback SUCCESS envelope only when the command body
// didn't produce a richer one (AC-9: exactly one document, never zero or two).
let _emitted = false;

export function hasEmittedOutput(): boolean {
  return _emitted;
}

/**
 * Write the single headless result document to stdout (AC-9 base envelope:
 * command / convoy_id / verdict / artifacts / timestamp; command-specific
 * fields extend it). 2-space indent, trailing newline. Call exactly once
 * per headless invocation.
 */
export function headlessOutput(payload: HeadlessResultPayload): string {
  const doc = JSON.stringify({ ...payload, timestamp: new Date().toISOString() }, null, 2) + '\n';
  process.stdout.write(doc);
  _emitted = true;
  return doc;
}

/**
 * Emit one progress/log event as a single JSON line on stderr (AC-10) —
 * `{event, ...data, timestamp}`. Never plain text, so Splunk/DataDog-style
 * collectors can parse without regex.
 */
export function headlessEvent(event: string, data?: Record<string, unknown>): string {
  const line = JSON.stringify({ event, ...data, timestamp: new Date().toISOString() }) + '\n';
  process.stderr.write(line);
  return line;
}

/**
 * Write a headless error envelope to stdout: `{error, ...extra, timestamp}`
 * (e.g. `{"error":"missing-context-field","field":"convoy_id",...}`).
 * The caller owns the exit code (see the exit matrix in index.ts).
 */
export function headlessError(error: string, extra?: Record<string, unknown>): string {
  const doc = JSON.stringify({ error, ...extra, timestamp: new Date().toISOString() }, null, 2) + '\n';
  process.stdout.write(doc);
  _emitted = true;
  return doc;
}
