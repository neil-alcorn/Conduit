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

interface PatternRule {
  key: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  patterns: RegExp[];
  maxInputChars?: number;
  action?: SanitizerDecision;
}

interface PatternConfig {
  rules: PatternRule[];
  actions: Record<string, SanitizerDecision>;
}

function stripInlineComment(value: string): string {
  const idx = value.indexOf("#");
  return (idx >= 0 ? value.slice(0, idx) : value).trim();
}

function unquote(value: string): string {
  const trimmed = stripInlineComment(value);
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function compilePattern(raw: string): RegExp {
  return new RegExp(raw, "i");
}

function loadPatternConfig(): PatternConfig {
  if (!fs.existsSync(PATTERN_FILE)) {
    return { rules: [], actions: {} };
  }

  const lines = fs.readFileSync(PATTERN_FILE, "utf8").split(/\r?\n/);
  const rules: PatternRule[] = [];
  const actions: Record<string, SanitizerDecision> = {};

  let section: "patterns" | "actions" | "" = "";
  let currentRule: PatternRule | null = null;
  let collectingRulePatterns = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (!rawLine.startsWith(" ") && trimmed === "patterns:") {
      section = "patterns";
      currentRule = null;
      collectingRulePatterns = false;
      continue;
    }

    if (!rawLine.startsWith(" ") && trimmed === "actions:") {
      section = "actions";
      currentRule = null;
      collectingRulePatterns = false;
      continue;
    }

    const ruleMatch = rawLine.match(/^  ([A-Za-z0-9_]+):\s*$/);
    if (section === "patterns" && ruleMatch) {
      currentRule = {
        key: ruleMatch[1],
        severity: "LOW",
        patterns: []
      };
      rules.push(currentRule);
      collectingRulePatterns = false;
      continue;
    }

    if (section === "patterns" && currentRule) {
      const severityMatch = rawLine.match(/^    severity:\s*(.+)\s*$/);
      if (severityMatch) {
        currentRule.severity = unquote(severityMatch[1]) as PatternRule["severity"];
        continue;
      }

      const maxLengthMatch = rawLine.match(/^    max_input_chars:\s*(.+)\s*$/);
      if (maxLengthMatch) {
        const value = Number.parseInt(unquote(maxLengthMatch[1]), 10);
        if (!Number.isNaN(value)) {
          currentRule.maxInputChars = value;
        }
        continue;
      }

      const actionMatch = rawLine.match(/^    action:\s*(.+)\s*$/);
      if (actionMatch) {
        currentRule.action = unquote(actionMatch[1]) as SanitizerDecision;
        continue;
      }

      if (/^    patterns:\s*$/.test(rawLine)) {
        collectingRulePatterns = true;
        continue;
      }

      const patternMatch = rawLine.match(/^      -\s+(.+)\s*$/);
      if (collectingRulePatterns && patternMatch) {
        currentRule.patterns.push(compilePattern(unquote(patternMatch[1])));
      }
      continue;
    }

    if (section === "actions" && trimmed.includes(":")) {
      const [key, value] = trimmed.split(":", 2);
      actions[key.trim()] = unquote(value) as SanitizerDecision;
    }
  }

  return { rules, actions };
}

export function sanitizeInput(input: string): MatchResult {
  const config = loadPatternConfig();
  const matches: string[] = [];
  let decision: SanitizerDecision = "allow";

  for (const rule of config.rules) {
    const ruleMatches: string[] = [];

    if (typeof rule.maxInputChars === "number" && input.length > rule.maxInputChars) {
      ruleMatches.push(`${rule.key}:max_input_chars`);
    }

    for (const pattern of rule.patterns) {
      if (pattern.test(input)) {
        ruleMatches.push(`${rule.key}:${pattern.source}`);
      }
    }

    if (ruleMatches.length > 0) {
      matches.push(...ruleMatches);
      const nextDecision =
        rule.action ??
        config.actions[rule.severity] ??
        "sanitize_and_log";

      if (nextDecision === "block_and_escalate") {
        decision = "block_and_escalate";
      } else if (nextDecision === "sanitize_and_log" && decision !== "block_and_escalate") {
        decision = "sanitize_and_log";
      }
    }
  }

  if (matches.length > 0) {
    return {
      decision,
      matches
    };
  }

  return {
    decision: "allow",
    matches: []
  };
}
