<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        AGENTS.md
# description: OpenAI Codex CLI entry shim (and any other agent host that reads AGENTS.md by convention). The actual agent-layer operating instructions live in directives/shared/agent-operating-instructions.md and are shared across all hosts. Edit there, not here.
# owner:       BOTH
# update:      Manual when the shim contract changes (rare). For operating instructions, edit the shared file. The "Workflows" section mirrors .claude/skills/ — keep aligned when adding/renaming skills.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Entry shim for Codex CLI** (and other AGENTS.md-reading hosts). Real operating instructions live in `directives/shared/agent-operating-instructions.md` — read that first; edit there, not here.
- **Workflows table below** maps each `conduit-*` workflow to its CLI invocation and extra protocol — the CLI is the source of truth.
- **After `gate approve`:** apply work-tracker state transitions per `directives/shared/convoy-agent-behavior.md` §3. Never skip silently.
- Keep the table aligned with `.claude/skills/` in the same commit when skills change.

# OpenAI Codex CLI (and other AGENTS.md-reading hosts) — Entry Shim

This is the OpenAI Codex CLI entry point. **The agent-layer operating instructions are agent-neutral** and live in [`directives/shared/agent-operating-instructions.md`](directives/shared/agent-operating-instructions.md). Read that file — it is the source of truth.

This shim exists because Codex CLI reads `AGENTS.md` by convention. Claude Code reads `CLAUDE.md` (a sibling shim at the repo root that also points at the same shared file). Both hosts read the same operating instructions; only the entry filename differs.

**If you are editing operating instructions:** edit `directives/shared/agent-operating-instructions.md`, not this file.

---

## Workflows

These mirror the 21 named workflows that Claude Code exposes via `.claude/skills/conduit-<command>/SKILL.md` and Codex can load from `~/.codex/skills/conduit-<command>/SKILL.md`. Each row gives the underlying CLI invocation, when to use it, and a pointer to any extra protocol that applies after running it. **The CLI is the source of truth** — the skill/workflow wrapper just teaches the agent host when to invoke it and what to do with the output.

### Quick-reference table

| Workflow | CLI invocation | When to use | Extra protocol |
|---|---|---|---|
| `conduit-context` | `conduit context [convoy-id]` | Session start, status check, "what's the current state?" | None — output is self-describing |
| `conduit-status` | `conduit status [convoy-id]` | Quick state check, lighter than `context` | None |
| `conduit-convoy` | `conduit convoy <new\|close\|pause\|resume> [args]` | Start new work, close delivery, park/un-park | After `close`, see `directives/shared/convoy-agent-behavior.md` §3 for work-tracker archive transitions |
| `conduit-plan` | `conduit plan <init\|show\|approve> [convoy-id]` | Before implementation — requirements → impact map → task graph | Read `directives/shared/spec-driven-planning.md` first |
| `conduit-execute` | `conduit execute <start\|status\|pause\|resume> [convoy-id]` | Wave-based autonomous execution after plan approval | Read `directives/shared/autonomous-execution.md` for wave/checkpoint rules; use `directives/shared/parallel-dispatch.md` for parallel-agent invocation |
| `conduit-review` | `conduit review <init\|show\|findings> [convoy-id] [--depth quick\|standard\|deep]` | Outbound code review (after impl) **OR** inbound review-feedback processing | Outbound: `directives/shared/code-review-protocol.md`. Inbound: `directives/shared/receiving-review.md` (findings arrive as `FND-NNNN` with severity blocking/major/minor/suggestion) |
| `conduit-gate` | `conduit gate <eval\|request\|approve\|reject\|skip> [convoy-id] [gate-type]` | Stage complete; needs gate review | **MANDATORY:** after `gate approve`, apply work-tracker state transitions (see below) |
| `conduit-pre-gate` | `conduit pre-gate [convoy-id]` | Verification checklist before requesting a gate (build, test, living-spec, AC, token budget) | None |
| `conduit-peer-approve` | (no direct CLI — agent generates a prompt) | Requester just hit a four-eyes block at Gate 3 or Gate 5 and needs a copy-pasteable peer prompt | See "Peer-approve prompt generation" below |
| `conduit-debug` | `conduit debug <start\|hypothesize\|evidence\|resolve\|list> [--session DBG-N]` | Investigating bugs / unexpected behavior with scientific method | Read `directives/shared/debug-protocol.md` |
| `conduit-session` | `conduit session <save\|resume\|list> [convoy-id] [--reason "..."]` | Pausing work, switching context, resuming a prior session | Read `directives/shared/session-handoff.md` |
| `conduit-brainstorm` | (no direct CLI — agent loads a directive) | BEFORE writing code or running `conduit plan` for a new feature | See "Brainstorm flow" below |
| `conduit-qa` | `conduit qa <visual\|e2e\|accessibility\|status> [--url URL]` | Playwright-based QA automation | None — outputs are self-describing |
| `conduit-skill` | `conduit skill <create\|list\|sync\|request-review> [args]` | Manage Conduit skills — note: skill *creation* targets the Claude Code skill format; Codex CLI users see "Skill creation" below |
| `conduit-rules` | `conduit rules <sync\|list\|install> [--seed-approved] [--kind <type>]` | Sync directives/standards/CLAUDE.md/CONDUIT.md/highway to/from the registry | None |
| `conduit-behaviors` | `conduit behaviors <show\|set> [key] [value]` | Configure CLI automation policies (auto_commit, auto_push, etc.) | None |
| `conduit-learn` | `conduit learn <skill\|rule> --name <id> --title <t> --content-file <path> [--description <d>] [--source <ref>] [--rule-kind <k>]` | File a proposed skill or rule as a DRAFT in the registry for admin review | Drafts do not propagate to other users until an admin approves in the registry — the approval gate stays intact |
| `conduit-design` | (no direct CLI — agent reads the skill's README and assets) | Generating branded UI, prototypes, mocks, or decks using your organization's design system | Read the full brand guide in `README.md`; link `colors_and_type.css` for tokens; use `templates/UI-SPEC.md` for frontend planning |
| `conduit-ui-phase` | (no direct CLI — orchestrates conduit-ui-researcher → conduit-ui-checker) | Creating a UI design contract (`UI-SPEC.md`) for a frontend phase with your brand tokens | Executes `~/.claude/get-shit-done/workflows/ui-phase.md`; 7-dimension quality check including Brand Adherence |
| `conduit-ui-review` | (no direct CLI — spawns conduit-ui-auditor) | Retroactive audit of implemented frontend code against UI-SPEC and your brand system | Produces scored `UI-REVIEW.md` with 7 pillars; offers to fix top-priority findings |

### `conduit-gate` — work-tracker state transitions after `approve` (MANDATORY)

The CLI does **not** auto-apply work-tracker state changes after `gate approve`. The canonical protocol lives in `directives/shared/convoy-agent-behavior.md` §3 — read `work_items.gate_transitions` in `convoy.yaml`, apply the transitions via your work tracker's API or CLI, and report what moved. Never silently skip this step.

### `conduit-peer-approve` — peer-review prompt generation

Use when the user is the **requester** on a Conduit convoy and just hit a four-eyes block at Gate 3 or Gate 5. Produces a self-contained prompt the requester sends to a peer.

**When NOT to trigger:** the gate is self-approvable (0, 1, 2, 4, 6, 7, 8); use standard `conduit gate` instead. Also skip if the user IS the peer (the receiver follows the prompt; this workflow generates it).

**Steps:**
1. Detect convoy and gate by running `conduit context [convoy-id]`. Parse active convoy ID and pending gate number. Abort if gate is not 3 or 5.
2. Locate gate-specific artifacts under `convoys/active/<convoyId>/audit/`:
   - `gate-<N>-request.md` (required)
   - Stage verdict artifact: Gate 3 → latest `review-REV-*.md`; Gate 5 → `qa-security-review.md`
3. Pick verify commands by stage:
   - Gate 3 (post-Implementation): `cd cli && npm run build && npm test`
   - Gate 5 (post-QA Security): `cd cli && npm audit --audit-level=low && npm run build && npm test`
4. Generate a copy-pasteable prompt that the peer can paste into any agent-host session, including a bootstrap step in case the peer doesn't have Conduit installed. Reference `.claude/skills/conduit-peer-approve/SKILL.md` for the canonical prompt template if you need exact wording.

The full prompt template lives in the Claude Code skill (`.claude/skills/conduit-peer-approve/SKILL.md`) — it's host-agnostic text, just adapt the bootstrap line to the peer's likely agent host.

### `conduit-brainstorm` — intent-before-implementation

Use BEFORE writing any code for a new feature, before `conduit plan init`, or whenever the user asks to build/add/modify behavior without a committed spec.

**Skip if:** intent is already committed in `living-spec.md` (go straight to `conduit plan`), the user is processing review feedback (use `conduit review` receive-mode), or the user is debugging existing code (use `conduit debug`).

**Protocol:**
1. Read `directives/shared/brainstorming.md` in full.
2. Run the four passes in order: **Requirements → User intent → Design tradeoffs → Document**.
3. Write outputs into `living-spec.md` (or draft them if no convoy exists yet).
4. **Stop and hand off to `conduit plan` — do not start implementation inside this workflow.**

### `conduit-skill` — skill creation note for Codex

`conduit skill create` produces the shared `SKILL.md` wrapper format (`.claude/skills/<name>/SKILL.md` in the repo). `conduit context` syncs bundled `conduit-*` skills into detected Claude and Codex skill homes, so Codex users get the same workflow triggers without duplicating the canonical skill files.

---

## Updating this section

When a bundled Conduit skill is added, renamed, or removed under `.claude/skills/`, update the table above in the same commit. The CLI source of truth (`cli/src/commands/<name>.ts`) is what both hosts ultimately call — keeping the workflow descriptions aligned avoids host-specific drift.

---

## Branding

CLI output uses the `CONDUIT_AGENT_NAME` environment variable for branding when referencing the agent layer. Set it to taste:

```bash
export CONDUIT_AGENT_NAME="Codex"   # or unset to use the default "the agent layer"
```
