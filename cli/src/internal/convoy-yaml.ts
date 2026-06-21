// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/convoy-yaml.ts
// description: AC-19 (review BUG-3) — single safe write path for convoy.yaml.
//              All CLI mutations of convoy.yaml go through parse-modify-
//              serialize (js-yaml load → mutate → dump) so user-supplied
//              values (title, gate name, withdrawal reason) can never spoof
//              `stage:` or any other field via embedded YAML syntax. The
//              leading CONDUIT MANAGED FILE comment header is preserved
//              across rewrites (js-yaml dump drops comments).
// owner:       BOTH
// update:      Manual when convoy.yaml serialization policy changes.
// schema:      convoys/schema/convoy.schema.json
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import yaml from 'js-yaml';

/**
 * Shared dump options for convoy.yaml writes.
 * - lineWidth -1: never fold long scalars (regex readers like readStage
 *   depend on one-line fields; folded continuations would break them).
 * - quotingType '"': when quoting IS required (e.g. "2026-06-10" must stay a
 *   string, multi-line payloads), use double quotes — matches the historical
 *   hand-templated style consumers' optional-quote regexes expect.
 * - noRefs: convoy.yaml never uses anchors; repeated objects stay literal.
 */
export const CONVOY_YAML_DUMP_OPTIONS: yaml.DumpOptions = {
  lineWidth: -1,
  quotingType: '"',
  noRefs: true,
};

/**
 * Split the leading comment header (the CONDUIT MANAGED FILE block) from the
 * YAML body. The header is every consecutive line starting with `#` from the
 * top of the file; returns '' when the file has no header (test fixtures).
 */
export function splitConvoyYamlHeader(content: string): { header: string; body: string } {
  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].startsWith('#')) i++;
  const header = i > 0 ? lines.slice(0, i).join('\n') + '\n' : '';
  const body = lines.slice(i).join('\n');
  return { header, body };
}

/** Read convoy.yaml, returning the parsed document and its comment header. */
export function loadConvoyYamlWithHeader(yamlPath: string): { header: string; doc: Record<string, unknown> } {
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const { header } = splitConvoyYamlHeader(content);
  // js-yaml v4 load() is the safe loader (DEFAULT_SCHEMA — no custom types).
  const doc = (yaml.load(content) ?? {}) as Record<string, unknown>;
  return { header, doc };
}

/** Serialize a convoy.yaml document, re-prepending the comment header. */
export function dumpConvoyYaml(doc: Record<string, unknown>, header = ''): string {
  return header + yaml.dump(doc, CONVOY_YAML_DUMP_OPTIONS);
}

/**
 * Parse-modify-serialize a convoy.yaml in place. `mutate` receives the parsed
 * document and edits it; the file is rewritten with the comment header intact.
 * When `touchLastUpdate` is supplied, the header's `# last_update:` line is
 * refreshed to that date (matching the historical pause/resume/close behavior).
 * Returns the mutated document for callers that need post-write reads.
 */
export function updateConvoyYaml(
  yamlPath: string,
  mutate: (doc: Record<string, unknown>) => void,
  opts?: { touchLastUpdate?: string },
): Record<string, unknown> {
  const { header, doc } = loadConvoyYamlWithHeader(yamlPath);
  mutate(doc);
  let outHeader = header;
  if (opts?.touchLastUpdate) {
    outHeader = outHeader.replace(/^(# last_update:\s*)\S.*$/m, `$1${opts.touchLastUpdate}`);
  }
  fs.writeFileSync(yamlPath, dumpConvoyYaml(doc, outHeader), 'utf-8');
  return doc;
}
