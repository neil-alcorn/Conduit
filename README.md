<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        README.md
# description: Entry point for developers using the Conduit orchestration repo.
# owner:       HUMAN
# update:      When setup process or major capabilities change.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Conduit = an AI-native delivery engine.** Every piece of work is a Convoy (one tracked work item) moving through 9 gated stages; a human approves each gate.
- **Setup:** clone + `./scripts/install-conduit.sh` (guide: `docs/onboarding/install.md`). Resume work by pasting `convoys/active/[id]/brief.md` into a fresh session.
- **Agents follow the stage directive** in `directives/<work-type>/stages/` plus `standards/`; managed repos carry CONDUIT.md, CONTEXT.md, QA/ACCEPTANCE.md.
- Convoys live in this central repo only — never in target repos.

# Conduit

AI-native software delivery workflow engine.

Conduit gives every developer and agent a consistent, auditable way to move software work through a 9-stage lifecycle — from intake through release — without reinventing the process each session. It works on personal projects or in any organization.

---

## New Developer Setup

Canonical install is documented in **[docs/onboarding/install.md](docs/onboarding/install.md)** — that page is the single source of truth. Quick version:

```bash
git clone <your-conduit-remote> "$HOME/Repos/conduit"
cd "$HOME/Repos/conduit" && ./scripts/install-conduit.sh
```

The script writes `~/.claude/bin/conduit` and adds a managed block to `~/.claude/CLAUDE.md` so Claude Code can reach Conduit from any repo. `conduit context` also syncs bundled `conduit-*` skills into detected Claude and Codex skill homes. For Windows-native PowerShell, `-InPlace` semantics, registry setup, and troubleshooting, see [docs/onboarding/install.md](docs/onboarding/install.md).

Full Conduit tour (convoys, stages, gates): [docs/getting-started.md](docs/getting-started.md).

---

## Starting a Convoy

**Resume an active convoy:**
> Paste `convoys/active/[id]/brief.md` into a new Claude session. Say "Proceed."

**See what's active:**
> Say: "Open Conduit. What convoys are active or pending?"

**Start a new convoy:**
> Say: "I want to start a new convoy for [description]."

---

## Key Docs

| Doc | What it covers |
|---|---|
| [docs/current-state.md](docs/current-state.md) | What's shipped, what's in flight, what's next |
| [docs/getting-started.md](docs/getting-started.md) | Full setup and convoy reference |
| [docs/roadmap.md](docs/roadmap.md) | Phase plan, module backlog, gap register |
| [standards/tool-use.md](standards/tool-use.md) | Which tool to use for every job — model selection, worktrees, WIP limits |
| [standards/](standards/) | Engineering patterns agents load during implementation |
| [docs/skills.md](docs/skills.md) | Claude Skills integration — what they are and how they fit |

---

## How It Works

Every piece of work is a **Convoy** — it maps to a tracked work item and moves through 9 stages.

At each stage, a **Directive** file tells the agent exactly what to do. At each stage boundary, a human approves a **Gate**. No stage starts until the previous gate is approved.

**Three artifacts Conduit manages in every repo:**

| File | Purpose |
|---|---|
| `CONDUIT.md` | Repo rules — what agents may and must not do |
| `CONTEXT.md` | Living architecture — module map, data flow, schema summary |
| `QA/ACCEPTANCE.md` | Acceptance criteria registry with test mappings |

---

## Repo Structure

```
conduit/
  install.md              ← Run this to set up a new machine
  directives/             ← Stage-by-stage agent instructions (by work type)
  standards/              ← Engineering patterns loaded during implementation
  convoys/
    active/               ← Running convoys
    archive/              ← Completed convoys
  highway-index/          ← Registry of all repos on the Conduit network
  scripts/                ← Automation helpers
  cli/                    ← Conduit CLI (TypeScript/Node)
  docs/                   ← Human-readable documentation
  templates/              ← Convoy and highway file templates
```
