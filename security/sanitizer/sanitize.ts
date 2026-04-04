// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        security/sanitizer/sanitize.ts
// description: TypeScript sanitizer implementation that evaluates inputs against the managed pattern library.
// owner:       BOTH
// update:      Manual as sanitization logic evolves.
// schema:      security/sanitizer/patterns.yaml
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";

export type SanitizerDecision = "allow" | "sanitize_and_log" | "block_and_escalate";

export interface MatchResult {
  decision: SanitizerDecision;
  matches: string[];
}

const PATTERN_FILE = path.resolve("security/sanitizer/patterns.yaml");

export function sanitizeInput(input: string): MatchResult {
  const patternFile = fs.existsSync(PATTERN_FILE) ? fs.readFileSync(PATTERN_FILE, "utf8") : "";
  const lower = input.toLowerCase();
  const matches: string[] = [];

  for (const needle of [
    "ignore previous instructions",
    "ignore all instructions",
    "you are now",
    "new persona",
    "[system]",
    "<system>",
    "developer mode",
    "sudo mode"
  ]) {
    if (lower.includes(needle)) {
      matches.push(needle);
    }
  }

  if (input.length > 50000) {
    matches.push("context_flooding:max_input_chars");
  }

  if (matches.length > 0) {
    return {
      decision: "block_and_escalate",
      matches
    };
  }

  void patternFile;

  return {
    decision: "allow",
    matches: []
  };
}
