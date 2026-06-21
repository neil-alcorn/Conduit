<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/quick-start.md
# description: Progressive onboarding guide — understand Conduit in 15 minutes.
# owner:       BOTH
# update:      Manual — keep in sync with CLAUDE.md and directives.
# last_update: 2026-04-17
# ─────────────────────────────────────────────────────────────────────
-->

# Conduit Quick Start

## What is Conduit?

Conduit is an AI-native delivery orchestration system. It gives AI agents
(Claude Code) a structured process for delivering software — with stages,
gates, and an audit trail. The CLI records what happened; the AI agent
executes the work and makes judgment calls.

---

## Your First Session

Start every session by loading the operating picture:

```bash
conduit context
```

This tells you: which convoy is active, what stage it is on, what gates are
pending, and which directives apply. Read the output before doing any work.

If no convoy is active, you are in **Standard Mode** — regular development
assistance with no process obligations.

---

## If You Are in a Convoy

A convoy is an active delivery effort moving through 9 stages (0-8). When
a convoy is active, Conduit enters **Convoy Mode**.

**What to do:**

1. Note your current stage from `conduit context` output
2. Read the stage directive for your work type:
   `directives/{work-type}/stages/0N-stage-name.md`
3. Do the work described in the directive
4. When the stage is complete, STOP and surface the gate checkpoint
5. The human approves the gate, and the convoy advances

**Key rule:** Never advance past a gate without human approval. Gates are
quality checkpoints, not bureaucratic speed bumps.

---

## If You Are Starting a Convoy

```bash
conduit convoy new --title "Feature Name" --work-type net-new --work-item 12345
```

This creates the convoy directory structure under `convoys/active/`. Then:

1. Write the `living-spec.md` — the living specification for the delivery
2. Complete Stage 0 (Intake) — populate convoy.yaml, audit linked work items
3. Request gate 0 approval to advance to Stage 1

Work types: `net-new`, `enhancement`, `bug-fix`, `maintenance`

---

## Common Commands

| Command | What it does |
|---------|--------------|
| `conduit context` | Load the full operating picture — start here |
| `conduit status [convoy-id]` | Check convoy stage and gate state |
| `conduit convoy new --title "..."` | Create a new delivery convoy |
| `conduit gate request [convoy-id] [gate]` | Assemble gate evaluation context |
| `conduit gate approve [convoy-id] [gate]` | Record human gate approval |
| `conduit sync [convoy-id]` | Sync work item state (placeholder in this build) |
| `conduit validate all` | Run all consistency checks |
| `conduit plan init [convoy-id]` | Generate a task graph from the living spec |
| `conduit execute start [convoy-id]` | Begin autonomous wave-based execution |
| `conduit session save [convoy-id]` | Save session state for handoff |

---

## Where to Find More

| Resource | What it covers |
|----------|---------------|
| `CLAUDE.md` | Session protocol, mode rules, CLI reference, repo layout |
| `directives/shared/convoy-agent-behavior.md` | Gate rules, agent behavior in convoy mode |
| `directives/shared/gate-evaluator.md` | Gate evaluation process and verdict types |
| `directives/shared/verification-protocol.md` | Evidence requirements before gate claims |
| `directives/{work-type}/stages/` | Stage-specific checklists and gate criteria |
| `standards/` | Work-tracker conventions, naming conventions, coding standards |
