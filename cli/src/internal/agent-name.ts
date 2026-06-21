// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/agent-name.ts
// description: Agent host name for user-facing CLI output. Reads the
//              CONDUIT_AGENT_NAME environment variable. Default is "the
//              agent layer" — agent-neutral phrasing that works for
//              Claude Code, OpenAI Codex CLI, GitHub Copilot CLI, Cursor,
//              and any future agent host without per-host branding.
// owner:       BOTH
// update:      Manual when the env-var contract changes.
// schema:      none
// last_update: 2026-05-13
// ─────────────────────────────────────────────────────────────────────

/**
 * Returns the human-readable name of the agent host driving Conduit, for
 * use in CLI output strings. Reads `CONDUIT_AGENT_NAME` from the
 * environment if set; otherwise returns the agent-neutral default
 * `"the agent layer"`.
 *
 * Hosts may set the env var to taste:
 *   CONDUIT_AGENT_NAME="Claude Code"
 *   CONDUIT_AGENT_NAME="Codex"
 *   CONDUIT_AGENT_NAME="Cursor"
 *
 * The directive content under `directives/shared/` uses agent-neutral
 * phrasing everywhere — this helper exists only for CLI output strings.
 */
export function agentName(): string {
  const env = process.env['CONDUIT_AGENT_NAME'];
  if (env && env.trim() !== '') return env.trim();
  return 'the agent layer';
}
