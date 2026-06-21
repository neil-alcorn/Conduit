<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        CLAUDE.md
# description: Claude Code entry shim. The actual agent-layer operating instructions live in directives/shared/agent-operating-instructions.md and are shared across Claude Code, OpenAI Codex CLI, and any future agent host. Edit there, not here.
# owner:       BOTH
# update:      Manual when the shim contract changes (rare). For operating instructions, edit the shared file.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Entry shim for Claude Code.** The real operating instructions are agent-neutral and live in `directives/shared/agent-operating-instructions.md` — read that file first.
- **Edit operating instructions there, never here** (or in the sibling `AGENTS.md` shim for Codex hosts).

# Claude Code — Entry Shim

This is the Claude Code entry point. **The agent-layer operating instructions are agent-neutral** and live in [`directives/shared/agent-operating-instructions.md`](directives/shared/agent-operating-instructions.md). Read that file — it is the source of truth.

This shim exists because Claude Code reads `CLAUDE.md` by convention. OpenAI Codex CLI reads `AGENTS.md` (a sibling shim at the repo root that also points at the same shared file). Both hosts read the same operating instructions; only the entry filename differs.

**If you are editing operating instructions:** edit `directives/shared/agent-operating-instructions.md`, not this file.
