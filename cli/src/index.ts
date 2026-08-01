#!/usr/bin/env node
// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/index.ts
// description: Entry point for the conduit CLI. Node.js/TypeScript — no Go required.
// owner:       BOTH
// update:      Manual for command surface changes.
// schema:      none
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import { runConvoy } from './commands/convoy.js';
import { runGate } from './commands/gate.js';
import { runCheckpoint } from './commands/checkpoint.js';
import { runSync } from './commands/sync.js';
import { runStatus } from './commands/status.js';
import { runContext } from './commands/context.js';
import { runInit } from './commands/init.js';
import { runValidate } from './commands/validate.js';
import { runPlan } from './commands/plan.js';
import { runExecute } from './commands/execute.js';
import { runReview } from './commands/review.js';
import { runDebug } from './commands/debug.js';
import { runSession } from './commands/session.js';
import { runSkill } from './commands/skill.js';
import { runRules } from './commands/rules.js';
import { runLearn } from './commands/learn.js';
import { runDecompose } from './commands/decompose.js';
import { runQa } from './commands/qa.js';
import { runBehaviors } from './commands/behaviors.js';
import { runPreGate } from './commands/pre-gate.js';
import { runAuditSummary } from './commands/audit-summary.js';
import { runMigrateStrayRegistry } from './commands/migrate-stray-registry.js';
import { runDoctor } from './commands/doctor.js';
import { runUsage } from './commands/usage.js';
import { runDocBudget } from './commands/doc-budget.js';
import { runDocs } from './commands/docs.js';
import { runDecisions } from './commands/decisions.js';
import { runInitiative } from './commands/initiative.js';
import { runMatrix } from './commands/matrix.js';
import { bold, cyan, dim, gray } from './internal/ui.js';
import { ensureClaudeMd, ensureConduitShim } from './internal/bootstrap.js';
import { shouldBootstrapClaude } from './internal/agent-host.js';
import { preflightSync, GitDivergenceError } from './internal/git-sync.js';
import { setHeadless, isHeadless, getHeadlessContext, MissingContextFieldError } from './internal/headless-io.js';
import { InvalidContextError } from './internal/context-parser.js';
import { headlessError, headlessEvent, headlessOutput, hasEmittedOutput } from './internal/headless-output.js';

/** Commands that own a headless surface (headless-protocol §a) plus `gate`,
 *  whose request path is headless-allowed. These get the AC-9 fallback
 *  envelope when their body completes without emitting one. */
const HEADLESS_COMMANDS = new Set(['plan', 'execute', 'qa', 'review', 'pre-gate', 'gate']);
import { resolveConvoyRoot, ConduitNotInitializedError } from './utils.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Commands that only read state. Skip the strict git preflight for these so
 *  users can always inspect repo state even when something is off. All other
 *  commands run preflightSync first to prevent silent history divergence. */
const READ_ONLY_COMMANDS = new Set([
  'context', 'status', 'validate', 'help', 'version', 'doctor', 'decisions',
  '--help', '--version',
]);

// Single source of truth: read version from package.json
const PKG_PATH = resolve(__dirname, '..', '..', '..', 'package.json');
const VERSION = JSON.parse(readFileSync(PKG_PATH, 'utf-8')).version as string;

/** One usage line per command, shown by `conduit <command> --help` and after
 *  unknown-subcommand errors. Keep in sync with each dispatcher's cases. */
const COMMAND_HELP: Record<string, string> = {
  'context':     'conduit context [convoy-id]',
  'sync':        'conduit sync [convoy-id]',
  'init':        'conduit init [--target <path>] [--global <central-path>] [--user]',
  'convoy':      'conduit convoy <new|close|pause|resume|remove|list> [convoy-id] [--force] [--confirm]',
  'gate':        'conduit gate <request|eval|approve|reject|skip|council> <convoy-id> <gate-N> [--reason "..."] [--request <file>] [--manifest <file>]',
  'checkpoint':  'conduit checkpoint <create|pass|fail|list> [convoy-id] [args]',
  'status':      'conduit status [convoy-id]',
  'validate':    'conduit validate <highway|convoy|registry|all>',
  'plan':        'conduit plan <init|show|approve> [convoy-id]',
  'execute':     'conduit execute <start|status|pause|resume|checkpoint|wave-complete|complete|fail> [convoy-id]',
  'review':      'conduit review <init|show|findings> [convoy-id] [--depth quick|standard|deep]',
  'debug':       'conduit debug <start|status|hypothesize|evidence|resolve|list> [args]',
  'session':     'conduit session <save|resume|list>',
  'decompose':   'conduit decompose <generate|lint|review|approve|apply|status> [convoy-id]',
  'skill':       'conduit skill <create|list|validate|sync|install|request-review|approve> [skill-name]',
  'rules':       'conduit rules <list|sync|install>',
  'learn':       'conduit learn <skill|rule> --name <id> --title <title> [--description <d>] --content-file <path> [--source <url-or-ref> | --evidence <ref>] [--convoy <id>] [--rule-kind <k>]',
  'qa':          'conduit qa <visual|accessibility|status> [--url <url>] [--tests <path>]',
  'behaviors':   'conduit behaviors <show|set> [key] [value]',
  'pre-gate':    'conduit pre-gate [convoy-id] [gate-N] [--accept]',
  'audit-summary': 'conduit audit-summary [--json <file>]',
  'doctor':      'conduit doctor',
  'usage':       'conduit usage <record|report> [args]',
  'doc-budget':  'conduit doc-budget',
  'docs':        'conduit docs tldr <--check|--apply>',
  'decisions':   'conduit decisions [convoy-id]',
  'migrate-stray-registry': 'conduit migrate-stray-registry [--apply]',
  'initiative':  'conduit initiative <new|list|set> [--title ...] [--urgency high|low] [--importance high|low] [--status active|done]',
  'matrix':      'conduit matrix',
};

/** One-line description per dispatch case — used by the headless JSON help
 *  (AC-18). Keep in sync with the switch in main() and COMMAND_HELP above. */
const COMMAND_DESCRIPTIONS: Record<string, string> = {
  'context':     'Session bootstrap — load operating picture',
  'sync':        'Refresh repo/registry state before work or gates',
  'init':        'Highway Init — onboard repos to Conduit',
  'convoy':      'Manage convoys (new, close, pause, resume)',
  'gate':        'Evaluate, approve, reject, or skip gates (approve/reject/skip are human-only — refused in headless mode)',
  'checkpoint':  'Manage checkpoints',
  'status':      'Show current status',
  'validate':    'Validate CONDUIT-managed documents',
  'plan':        'Spec-driven planning — requirements → task graph',
  'execute':     'Wave-based autonomous execution',
  'review':      'Multi-agent code review with scoring',
  'debug':       'Scientific debugging with state persistence',
  'session':     'Save/resume context across sessions',
  'decompose':   'Requirements → Epic/Feature/Story',
  'skill':       'Create and manage Conduit skills',
  'rules':       'Sync/install directives, standards, CLAUDE.md to the registry',
  'learn':       'File a draft skill/rule proposal for admin review',
  'qa':          'Visual regression, E2E, accessibility',
  'behaviors':   'Show or set configurable CLI behavior policies',
  'pre-gate':    'Pre-gate verification checklist before requesting a gate',
  'audit-summary': 'Render `npm audit --json` as a deduped markdown table',
  'doctor':      'Check repo/git/build/identity health',
  'usage':       'Record/report Claude model usage per stage',
  'doc-budget':  'Audit token cost of context-loaded markdown files',
  'docs':        'Manage doc conventions (e.g., `docs tldr --check`)',
  'decisions':   'Show decisions log for a convoy',
  'migrate-stray-registry': 'Migrate stray registry entries to the central registry',
  'initiative':  'Manage initiatives (planning items prioritized in the matrix)',
  'matrix':      'Show the Eisenhower urgent/important matrix',
};

/** AC-18: `--headless --help` (or `--headless` with no command) emits JSON
 *  describing the command surface instead of the human banner. */
function printHeadlessHelp(): void {
  const commands: Record<string, { usage: string; description: string }> = {};
  for (const name of Object.keys(COMMAND_HELP)) {
    commands[name] = {
      usage: COMMAND_HELP[name],
      description: COMMAND_DESCRIPTIONS[name] ?? '',
    };
  }
  process.stdout.write(JSON.stringify({
    command: 'help',
    version: VERSION,
    commands,
    timestamp: new Date().toISOString(),
  }, null, 2) + '\n');
}

function printWelcome(): void {
  const rule = cyan('\u2501'.repeat(58));
  const logo = [
    '   _____ ____  _   _ ____  _   _ ___ _____',
    '  / ____/ __ \\| \\ | |  _ \\| | | |_ _|_   _|',
    ' | |   | |  | |  \\| | | | | | | || |  | |',
    ' | |   | |  | | . ` | | | | | | || |  | |',
    ' | |___| |__| | |\\  | |_| | |_| || |  | |',
    '  \\_____\\____/|_| \\_|____/ \\___/|___| |_|',
  ];

  console.log('');
  console.log(rule);
  for (const line of logo) {
    console.log(bold(cyan(line)));
  }
  console.log('');
  console.log(cyan(`  AI-native software delivery orchestration    v${VERSION}`));
  console.log(rule);
  console.log('');

  console.log(bold('  Core Commands'));
  console.log(gray('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'));
  console.log(`  ${cyan('context')}      Session bootstrap \u2014 load operating picture`);
  console.log(`  ${cyan('sync')}         Refresh repo/registry state before work or gates`);
  console.log(`  ${cyan('init')}         Highway Init \u2014 onboard repos to Conduit`);
  console.log(`  ${cyan('convoy')}       Manage convoys (new, close, pause, resume)`);
  console.log(`  ${cyan('gate')}         Evaluate, approve, reject, or skip gates`);
  console.log(`  ${cyan('checkpoint')}   Manage checkpoints`);
  console.log(`  ${cyan('status')}       Show current status`);
  console.log(`  ${cyan('validate')}     Validate CONDUIT-managed documents`);
  console.log(`  ${cyan('doctor')}       Check repo/git/build/identity health`);
  console.log('');

  console.log(bold('  Planning & Execution'));
  console.log(gray('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'));
  console.log(`  ${cyan('plan')}         Spec-driven planning \u2014 requirements \u2192 task graph`);
  console.log(`  ${cyan('execute')}      Wave-based autonomous execution`);
  console.log(`  ${cyan('review')}       Multi-agent code review with scoring`);
  console.log(`  ${cyan('debug')}        Scientific debugging with state persistence`);
  console.log(`  ${cyan('session')}      Save/resume context across sessions`);
  console.log(`  ${cyan('initiative')}   Manage initiatives (planning items prioritized in the matrix)`);
  console.log(`  ${cyan('matrix')}       Show the Eisenhower urgent/important matrix`);
  console.log(`  ${cyan('decompose')}    Requirements \u2192 Epic/Feature/Story`);
  console.log(`  ${cyan('skill')}        Create and manage Conduit skills`);
  console.log(`  ${cyan('rules')}        Sync/install directives, standards, CLAUDE.md to the registry`);
  console.log(`  ${cyan('learn')}        File a draft skill/rule proposal for admin review`);
  console.log(`  ${cyan('qa')}           Visual regression, E2E, accessibility`);
  console.log(`  ${cyan('audit-summary')} Render \`npm audit --json\` as a deduped markdown table`);
  console.log(`  ${cyan('behaviors')}    Show or set configurable CLI behavior policies`);
  console.log(`  ${cyan('usage')}        Record/report Claude model usage per stage`);
  console.log(`  ${cyan('doc-budget')}   Audit token cost of context-loaded markdown files`);
  console.log(`  ${cyan('docs')}         Manage doc conventions (e.g., \`docs tldr --check\`)`);
  console.log('');

  console.log(bold('  Quick Start'));
  console.log(gray('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'));
  console.log(`  ${dim('$')} conduit context           ${gray('# load your convoy\'s operating picture')}`);
  console.log(`  ${dim('$')} conduit status            ${gray('# see where things stand')}`);
  console.log(`  ${dim('$')} conduit convoy new        ${gray('# start a new delivery convoy')}`);
  console.log('');
}

async function main(): Promise<void> {
  let args = process.argv.slice(2);

  // ── Headless arg plumbing (AC-1/16/18) ────────────────────────────────────
  // `--headless` may appear anywhere; strip it and set the module singleton
  // once — commands read it via isHeadless(), never a threaded flag. `--json`
  // is a silent no-op alias ONLY under --headless (headless already implies
  // JSON); interactive commands that take `--json <file>` (audit-summary)
  // keep their flag untouched.
  // Parsed BEFORE the bootstrap block (Stage-5 finding SEC-L2): a bootstrap
  // throw must still produce the headless JSON error document, not a human
  // line with no stdout output.
  if (args.includes('--headless')) {
    setHeadless(true);
    args = args.filter((a) => a !== '--headless' && a !== '--json');

    // AC-9/AC-10 single choke point: command bodies print via console.*
    // throughout — rather than rewriting every call site, route ALL console
    // output to JSON-lines events on stderr. stdout stays reserved for the
    // one result document (headlessOutput/headlessError write to
    // process.stdout directly, bypassing this patch).
    const toEvent = (event: string) => (...parts: unknown[]) =>
      headlessEvent(event, { message: parts.map(String).join(' ') });
    console.log = toEvent('log');
    console.info = toEvent('log');
    console.warn = toEvent('warning');
    console.error = toEvent('error');
  }

  // Self-healing bootstrap is only needed for the Claude host surface.
  // Runs AFTER headless parsing so a bootstrap throw lands in the headless
  // exit matrix (SEC-L2).
  if (shouldBootstrapClaude()) {
    ensureClaudeMd();
    ensureConduitShim();
  }

  if (args.length === 0 || args[0] === '--help' || args[0] === 'help') {
    if (isHeadless()) {
      printHeadlessHelp();
      return;
    }
    printWelcome();
    return;
  }

  if (args[0] === '--version' || args[0] === 'version') {
    console.log(`conduit ${VERSION}`);
    return;
  }

  const [command, ...rest] = args;

  // ── Per-command help: answer before any preflight/network work ───────────
  if (rest[0] === '--help' || rest[0] === '-h' || rest[0] === 'help') {
    if (COMMAND_HELP[command]) {
      console.log(`Usage: ${COMMAND_HELP[command]}`);
      console.log(dim(`Workflow protocol: .claude/skills/conduit-${command}/SKILL.md (if present)`));
      return;
    }
    console.error(`unknown command: ${command}`);
    printWelcome();
    process.exit(1);
  }

  // ── Preflight: refuse mutating commands on a diverged checkout ───────────
  // This is the single defense against teammates silently accumulating
  // local-only commits when the CLI auto-commits their state changes. For
  // read-only commands we skip — users must always be able to inspect state.
  if (!READ_ONLY_COMMANDS.has(command)) {
    try {
      const convoyRepoPath = resolveConvoyRoot('.');
      preflightSync(convoyRepoPath, command);
    } catch (err) {
      if (err instanceof GitDivergenceError) {
        console.error(err.message);
        process.exit(2);
      }
      throw err;
    }
  }

  switch (command) {
    case 'context':     await runContext(rest); break;
    case 'sync':        await runSync(rest); break;
    case 'init':        await runInit(rest); break;
    case 'convoy':      await runConvoy(rest); break;
    case 'gate':        await runGate(rest); break;
    case 'checkpoint':  await runCheckpoint(rest); break;
    case 'status':      await runStatus(rest); break;
    case 'validate':    await runValidate(rest); break;
    case 'plan':        await runPlan(rest); break;
    case 'execute':     await runExecute(rest); break;
    case 'review':      await runReview(rest); break;
    case 'debug':       await runDebug(rest); break;
    case 'session':     await runSession(rest); break;
    case 'initiative':  await runInitiative(rest); break;
    case 'matrix':      await runMatrix(rest); break;
    case 'decompose':   await runDecompose(rest); break;
    case 'skill':       await runSkill(rest); break;
    case 'rules':       await runRules(rest); break;
    case 'learn':       await runLearn(rest); break;
    case 'qa':          await runQa(rest); break;
    case 'behaviors':   await runBehaviors(rest); break;
    case 'pre-gate':    await runPreGate(rest); break;
    case 'audit-summary': await runAuditSummary(rest); break;
    case 'migrate-stray-registry': await runMigrateStrayRegistry(rest); break;
    case 'doctor':      await runDoctor(rest); break;
    case 'usage':       await runUsage(rest); break;
    case 'doc-budget':  await runDocBudget(rest); break;
    case 'docs':        await runDocs(rest); break;
    case 'decisions':   await runDecisions(rest); break;
    default:
      console.error(`unknown command: ${command}`);
      printWelcome();
      process.exit(1);
  }

  // AC-9 fallback: a headless command that completed without writing its own
  // result document still owes the pipeline exactly one stdout JSON envelope.
  // Commands that emitted a richer envelope (e.g. gate eval) skip this.
  if (isHeadless() && HEADLESS_COMMANDS.has(command) && !hasEmittedOutput()) {
    headlessOutput({
      command,
      convoy_id: String(getHeadlessContext()['convoy_id'] ?? ''),
      verdict: 'SUCCESS',
      artifacts: [],
    });
  }
}

main().catch((err: Error) => {
  // ── Headless exit-code matrix (AC-3/13/14/15) ─────────────────────────────
  // Exactly one JSON error document on stdout, never a stack trace; the code
  // tells pipelines which branch to take: 3 = validation (missing field or
  // malformed CONTEXT), 4 = not Conduit-initialized, 1 = internal.
  if (isHeadless()) {
    if (err instanceof MissingContextFieldError) {
      headlessError('missing-context-field', { field: err.field, message: err.message });
      process.exit(3);
    }
    if (err instanceof InvalidContextError) {
      headlessError('invalid-context', { details: err.details });
      process.exit(3);
    }
    if (err instanceof ConduitNotInitializedError) {
      headlessError('not-conduit-initialized', { message: err.message });
      process.exit(4);
    }
    headlessError('internal', { exception: err.constructor?.name ?? 'Error', message: err.message });
    process.exit(1);
  }

  // Humans get the message; stacks only when explicitly debugging.
  if (process.env.CONDUIT_DEBUG) {
    console.error(err.stack || err.message);
  } else {
    console.error(`conduit: ${err.message}`);
  }
  const command = process.argv[2];
  if (command && COMMAND_HELP[command]) {
    console.error(`Usage: ${COMMAND_HELP[command]}`);
  }
  process.exit(1);
});
