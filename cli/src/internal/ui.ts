// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/ui.ts
// description: Terminal output styling for Conduit CLI. ANSI colors,
//              mode banners, tagged prefixes for transparency.
// owner:       BOTH
// update:      Manual when output format changes.
// schema:      none
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

// ── ANSI escape codes ──────────────────────────────────────────────
const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;

// Foreground colors
const FG_RED = `${ESC}31m`;
const FG_GREEN = `${ESC}32m`;
const FG_YELLOW = `${ESC}33m`;
const FG_BLUE = `${ESC}34m`;
const FG_MAGENTA = `${ESC}35m`;
const FG_CYAN = `${ESC}36m`;
const FG_WHITE = `${ESC}37m`;
const FG_GRAY = `${ESC}90m`;

// Background colors
const BG_RED = `${ESC}41m`;
const BG_GREEN = `${ESC}42m`;
const BG_YELLOW = `${ESC}43m`;
const BG_CYAN = `${ESC}46m`;

// ── Color detection ────────────────────────────────────────────────
function supportsColor(): boolean {
  if (process.env['NO_COLOR']) return false;
  if (process.env['FORCE_COLOR']) return true;
  if (process.env['TERM'] === 'dumb') return false;
  // Windows Terminal, VS Code, and most modern terminals support color
  return process.stdout.isTTY === true || process.env['WT_SESSION'] !== undefined
    || process.env['TERM_PROGRAM'] === 'vscode';
}

const USE_COLOR = supportsColor();

function c(code: string, text: string): string {
  return USE_COLOR ? `${code}${text}${RESET}` : text;
}

// ── Public styling functions ───────────────────────────────────────

// Text styles
export function bold(text: string): string { return c(BOLD, text); }
export function dim(text: string): string { return c(DIM, text); }
export function red(text: string): string { return c(FG_RED, text); }
export function green(text: string): string { return c(FG_GREEN, text); }
export function yellow(text: string): string { return c(FG_YELLOW, text); }
export function blue(text: string): string { return c(FG_BLUE, text); }
export function magenta(text: string): string { return c(FG_MAGENTA, text); }
export function cyan(text: string): string { return c(FG_CYAN, text); }
export function gray(text: string): string { return c(FG_GRAY, text); }

// ── Tagged prefixes ────────────────────────────────────────────────
// These make it visible WHAT Conduit is doing at all times

export function tag(label: string, color: string, text: string): string {
  const prefix = USE_COLOR ? `${color}${BOLD}[${label}]${RESET}` : `[${label}]`;
  return `${prefix} ${text}`;
}

export function conduit(text: string): string { return tag('CONDUIT', FG_CYAN, text); }
export function convoy(text: string): string { return tag('CONVOY', FG_BLUE, text); }
export function gate(text: string): string { return tag('GATE', FG_MAGENTA, text); }
export function skill(text: string): string { return tag('SKILL', FG_GREEN, text); }
export function directive(text: string): string { return tag('DIRECTIVE', FG_YELLOW, text); }
export function plan(text: string): string { return tag('PLAN', FG_CYAN, text); }
export function execute(text: string): string { return tag('EXECUTE', FG_BLUE, text); }
export function review(text: string): string { return tag('REVIEW', FG_MAGENTA, text); }
export function debug(text: string): string { return tag('DEBUG', FG_RED, text); }
export function session(text: string): string { return tag('SESSION', FG_GREEN, text); }
export function lint(text: string): string { return tag('LINT', FG_YELLOW, text); }
export function decompose(text: string): string { return tag('DECOMPOSE', FG_CYAN, text); }
export function sanitizer(text: string): string { return tag('SANITIZER', FG_RED, text); }

// ── Status indicators ──────────────────────────────────────────────

export function pass(text: string): string {
  return USE_COLOR ? `${FG_GREEN}${BOLD}\u2713${RESET} ${FG_GREEN}${text}${RESET}` : `\u2713 ${text}`;
}

export function fail(text: string): string {
  return USE_COLOR ? `${FG_RED}${BOLD}\u2717${RESET} ${FG_RED}${text}${RESET}` : `\u2717 ${text}`;
}

export function warn(text: string): string {
  return USE_COLOR ? `${FG_YELLOW}${BOLD}\u26A0${RESET} ${FG_YELLOW}${text}${RESET}` : `\u26A0 ${text}`;
}

export function info(text: string): string {
  return USE_COLOR ? `${FG_CYAN}\u2139${RESET} ${text}` : `\u2139 ${text}`;
}

// ── Banners ────────────────────────────────────────────────────────

export function banner(lines: string[]): string {
  const width = 62;
  const rule = '\u2501'.repeat(width);
  const colorRule = USE_COLOR ? `${FG_CYAN}${rule}${RESET}` : rule;
  const colorLines = lines.map(l => USE_COLOR ? `${FG_CYAN}${BOLD}${l}${RESET}` : l);
  return [colorRule, ...colorLines, colorRule].join('\n');
}

export function convoyBanner(convoyId: string, stage: number, stageName: string, gateState: string): string {
  return banner([
    'CONDUIT CONVOY ACTIVE',
    `Convoy:  ${convoyId}`,
    `Stage:   ${stage} \u2014 ${stageName}`,
    `Gate:    ${gateState}`,
  ]);
}

// ── Tables ─────────────────────────────────────────────────────────

export function header(text: string): string {
  return USE_COLOR ? `\n${BOLD}${FG_WHITE}${text}${RESET}` : `\n${text}`;
}

export function divider(): string {
  const line = '\u2500'.repeat(62);
  return USE_COLOR ? `${FG_GRAY}${line}${RESET}` : line;
}

export function keyValue(key: string, value: string): string {
  const k = USE_COLOR ? `${FG_GRAY}${key}:${RESET}` : `${key}:`;
  return `  ${k.padEnd(USE_COLOR ? 30 + 9 : 30)} ${value}`;
}

// ── Progress ───────────────────────────────────────────────────────

export function progress(current: number, total: number, label: string): string {
  const pct = Math.round((current / total) * 100);
  const barWidth = 20;
  const filled = Math.round((current / total) * barWidth);
  const empty = barWidth - filled;
  const bar = USE_COLOR
    ? `${FG_GREEN}${'\u2588'.repeat(filled)}${FG_GRAY}${'\u2591'.repeat(empty)}${RESET}`
    : `${'\u2588'.repeat(filled)}${'\u2591'.repeat(empty)}`;
  return `  ${bar} ${pct}% ${label}`;
}

// ── Severity colors ────────────────────────────────────────────────

export function severity(level: string, text: string): string {
  switch (level.toLowerCase()) {
    case 'critical': return c(`${BG_RED}${FG_WHITE}${BOLD}`, ` ${text} `);
    case 'high': return c(`${FG_RED}${BOLD}`, text);
    case 'medium': return c(FG_YELLOW, text);
    case 'low': return c(FG_CYAN, text);
    case 'info': return c(FG_GRAY, text);
    default: return text;
  }
}

// ── Mode indicator (shown at session start) ────────────────────────

export function modeIndicator(mode: 'convoy' | 'standard', details?: string): string {
  if (mode === 'convoy') {
    const label = USE_COLOR ? `${BG_CYAN}${FG_WHITE}${BOLD} CONVOY MODE ${RESET}` : '[ CONVOY MODE ]';
    return details ? `${label} ${details}` : label;
  }
  const label = USE_COLOR ? `${FG_GRAY}[ STANDARD MODE ]${RESET}` : '[ STANDARD MODE ]';
  return details ? `${label} ${details}` : label;
}
