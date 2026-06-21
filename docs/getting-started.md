<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/getting-started.md
# description: Startup guide for new developers using Conduit.
# owner:       HUMAN
# update:      Manual. Update whenever the startup process changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

# Getting Started with Conduit

This guide covers everything a new developer needs to use Conduit from day one. Read it before starting any convoy.

---

## What Conduit Is

Conduit is an AI-native software delivery workflow engine. It is **not a CI/CD tool** and it is **not a project management app**. It is a structured way to use Claude Code agents to move software work through a defined lifecycle without reinventing the process every session.

The core idea: every piece of work (called a **Convoy**) moves through 9 stages. At each stage, a **Directive** file tells the agent exactly what to do and what not to do. At each stage boundary, a human approves a **Gate** before the work advances.

**Three things Conduit manages:**

| Thing | What it is | Where it lives |
|---|---|---|
| **Highway** | Context files in every repo so agents don't need to re-learn the codebase | `CONDUIT.md`, `CONTEXT.md`, `QA/ACCEPTANCE.md` in each repo root |
| **Convoy** | A tracked unit of work with state, gates, and audit history | `convoys/active/[id]/convoy.yaml` + `living-spec.md` |
| **Directives** | Stage-specific prompt files that tell the agent how to behave | `directives/[work-type]/stages/0N-[name].md` |

Conduit runs **in this VS Code chat window** — you paste a directive at the start of a session, and Conduit handles the rest. There is no separate service to run.

---

## Quick Install (Recommended)

The canonical install guide lives at [docs/onboarding/install.md](onboarding/install.md) — 3 steps, Windows and macOS. Short version:

### Windows (PowerShell)
```powershell
git clone <your-conduit-remote> "$env:USERPROFILE\Repos\conduit"
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Repos\conduit\scripts\install-conduit.ps1"
```

### Mac/Linux/Git Bash
```bash
git clone <your-conduit-remote> "$HOME/Repos/conduit"
cd "$HOME/Repos/conduit" && ./scripts/install-conduit.sh
```

The install script builds the CLI, seeds your `.conduit/config.yaml`, wires the `~/.claude/bin/conduit` shim, and registers the checkout as your central conduit repo. Optionally, configure a registry backend — see [the optional registry setup in the install guide](onboarding/install.md#step-3--optional-registry).

### Staying in Sync

Updates flow through your remote automatically: the first conduit command of the day fast-forwards the central checkout and rebuilds the CLI, and `conduit context` pulls + syncs skills/rules on every session start. To force an update:
```bash
cd path/to/conduit
git pull && npm run build
```

Everyone who shares the remote gets the same CLI version. No manual distribution needed.

### Work-Tracker Authentication (optional)

This build ships with the work-tracker integration as a placeholder — `conduit sync` is a stub. If you wire Conduit to an issue/work tracker, provide your tracker's auth via environment variables (e.g. an API token) and configure it in `.conduit/config.yaml`. Conduit works fully without any tracker connection.

---

## One-Time Setup (per developer)

**The fast path:** Clone the repo, open Claude Code, say "Run install.md" — Claude handles everything below automatically.

```bash
git clone <your-conduit-remote> "%USERPROFILE%\Repos\conduit"
# Open Claude Code in that directory, then tell Claude:
# "Run install.md"
```

Claude will ask for your name, email, and which project you're working in — then clone the project repos, run highway init on the core ones, build the CLI, and show you active convoys.

---

**Manual setup (if you prefer):**

### 1. Clone the conduit repo

```bash
git clone <your-conduit-remote> "$HOME/Repos/conduit"
```

### 2. Fill in your config

```bash
cp .conduit/config.yaml.example .conduit/config.yaml
# Edit .conduit/config.yaml with your name and email
```

The `.conduit/` directory is **gitignored** — your config stays local.

### 3. (Optional) Configure a registry or work tracker

The registry and work-tracker integrations are optional. If you use them, set the relevant environment variables (`CONDUIT_REGISTRY_URL` / `CONDUIT_REGISTRY_API_KEY` for the registry; your tracker's auth token for the work tracker) and reference them in `.conduit/config.yaml`. Conduit runs fully without either.

### 4. Build the CLI

```bash
cd cli
npm install
npm run build
```

Verify:
```bash
node dist/cli/src/index.js --version
```

---

## Initializing a Repo (Highway Init)

Before any agent touches a repo, that repo needs **Highway files**. These are three files that tell agents who owns the repo, what it does, and what the rules are.

### What gets created

| File | Purpose |
|---|---|
| `CONDUIT.md` | Signals: repo owner, tech stack, what agents may/must not do, forbidden patterns |
| `CONTEXT.md` | Living architecture: module map, data flow, auth model, schema summary, known failure modes |
| `QA/ACCEPTANCE.md` | Criteria registry: all acceptance criteria with IDs, test mappings, visual baselines |

### How to run it

```
conduit highway init [path-to-repo]
```

Or manually — copy the templates from `conduit/templates/highway/` and fill them in for the specific repo.

### When to do this

- **Before starting any convoy** in that repo
- **Before absorbing code** from a source repo into a target app (init the source repo first, read it, then port)
- **Before any agent session** in a repo that doesn't have these files

### Register the repo in the Highway Index

After init, add an entry to `conduit/highway-index/repos/[repo-slug].yaml`:

```yaml
slug: "my-repo"
path: "../my-repo"
highway_initialized: true
initialized_at: "YYYY-MM-DD"
```

And update `conduit/highway-index/index.yaml` with the new repo count.

---

## Starting a Convoy

A **Convoy** is one unit of work. It maps to a tracked work item.

### Step 1 — Create the convoy directory

```bash
mkdir convoys/active/[convoy-id]
cp convoys/active/_template/convoy.yaml convoys/active/[convoy-id]/convoy.yaml
cp convoys/active/_template/living-spec.md convoys/active/[convoy-id]/living-spec.md
```

Fill in `convoy.yaml`:
- `id`, `title`, `work_type` (`net-new` | `enhancement` | `maintenance` | `bug-fix`)
- `work_item` — the tracked work item ID this maps to (optional)
- `workstreams` — one entry per repo that will be touched

Fill in `living-spec.md`:
- Intent (what problem are we solving and for whom)
- Acceptance Criteria in Given/When/Then format

### Step 2 — Gate 0: Intake review

Paste this at the start of a Claude session:

```
Load and follow the directive at: conduit/directives/[work-type]/stages/00-intake.md
Convoy: convoys/active/[convoy-id]/
```

The agent runs Stage 0. It reads the living-spec, checks completeness, flags gaps. Review its output and either approve or request changes.

**Approve by editing `convoy.yaml`:**
```yaml
gate_history:
  - gate: 0
    approved_by: "your-name"
    approved_at: "YYYY-MM-DD"
    notes: "Rationale for approval"
```

### Step 3 — Continue through stages

Each stage has a directive. Paste the stage prompt at the start of each session:

```
Load and follow the directive at: conduit/directives/[work-type]/stages/0N-[stage].md
Convoy: convoys/active/[convoy-id]/
Repo: path-to-repo/
```

The stages for `net-new`:

| Stage | Name | What gets produced |
|---|---|---|
| 0 | Intake | Living spec, problem statement, audience scores |
| 1 | BA Requirements | Acceptance criteria, stakeholder sign-off |
| 2 | Solution Design | Architecture decisions, schema, API contracts |
| 3 | Implementation | Working code, unit tests, updated CONTEXT.md |
| 4 | QA Unit | Test execution report, criterion coverage matrix, QA verdict |
| 5 | QA Security | Auth model review, OWASP top-10 check |
| 6 | QA Regression | Smoke tests against existing functionality |
| 7 | BP/Comms | Stakeholder brief (only if bp_gate_required = true) |
| 8 | Release | Deploy checklist, migration runbook, release notes |

---

## Gate Approvals and Commit Rhythm

**Gates are the commit trigger.** Do not commit mid-work. Commit when a gate is approved.

| Event | Action |
|---|---|
| Gate approved | Commit all changes with message `Gate N approved: [summary]` |
| Stage complete (no gate) | Commit with message `Stage N complete: [summary]` |
| Mid-session save | Stash or WIP commit — do not push |

This keeps git history aligned with the convoy audit trail. Every push should represent a gate boundary.

### Work-tracker card movement (if a tracker is wired up)

| Stage | Work-tracker action |
|---|---|
| Convoy started | Parent work item → Active |
| Child item started | Work item → Active |
| Gate approved | Move completed child items → Resolved |
| Convoy closed | Parent → Resolved, all children → Closed |

---

## Entering and Exiting Conduit

### Starting a session

**Option A — Resume an active convoy (most common):**
Paste the contents of `convoys/active/[id]/brief.md` into a new Claude session. The brief is the prompt. Say "Proceed."

**Option B — Start fresh (no active convoy):**
Say: *"Open Conduit. What convoys are active or pending?"*
Conduit will list active convoys with their current stage, and pending convoys with their readiness status.

**Option C — Start a new convoy:**
Say: *"I want to start a new convoy for [description]."*
Conduit walks you through work-item creation, file setup, and Gate 0.

### Exiting a session

Conduit sessions end naturally — there's no shutdown ritual. When Gate 8 closes and the convoy archives, Conduit surfaces what's next and waits for your decision. You can:
- Start the next convoy
- Switch to a different active convoy
- End the session (just close the window)

### Single window vs two windows

**Single window (default):** This window handles everything — directives, implementation guidance, gate approvals, commits, work-tracker card movement. Most convoys run fine this way.

**Two windows (Stage 3 optimization):** For large implementations, a second window dedicated to deep code work keeps this window free for gate processing. The second window follows its brief and reports back. It never commits.

The ⛔ commit discipline block in every brief enforces this regardless of how many windows are open.

---

## Two-Window Pattern (when used)

| Window | Responsibility |
|---|---|
| **Conduit window** (this repo) | Convoy state, directives, gate approvals, work-tracker card movement, commits across all repos |
| **Code window** (the target repo) | Implementation, tests, running builds — reports output, never commits |

**Coordination:** Both windows read the same `living-spec.md` and `CONTEXT.md`. At the start of each Code window session: `git pull` to pick up convoy state updates.

The "hand off to Conduit window" phrase means: *report your output to the human*. There is no separate process — you are the Conduit window.

### Worktrees in two-window convoys

The Code window should work in a **git worktree** — an isolated copy of the repo on the feature branch — so the Conduit window's view of master stays clean and the two windows never step on each other.

```bash
# Code window: set up before touching any code (run from repo root)
git worktree add ../myapp-feature-1234 feature/1234
# All work happens in ../myapp-feature-1234

# Conduit window: after Gate 3 approval, clean up
git worktree remove ../myapp-feature-1234
git worktree prune
```

When **not** to use a worktree: single-window convoys. The isolation benefit only matters when two sessions share the same repo simultaneously.

Full worktree reference: `standards/tool-use.md`

---

## Source Repo Absorption Pattern

When a target app absorbs a module from a source repo, follow this sequence. Skipping it tends to lose context that later has to be reverse-engineered.

### Step 1 — Highway Init the source repo

Run `conduit highway init` on the source repo before reading it. This creates CONTEXT.md which captures what's actually there.

### Step 2 — Run a Discovery convoy first

Create a `discovery` type convoy (not `net-new`) for the source repo:
- Work type: `discovery`
- Goal: read the source repo, extract requirements, document what to preserve and what to change
- Output: a requirements document that feeds the absorption convoy's Stage 1

### Step 3 — Note critical differences

Key things to check when absorbing:
- **Database** — source may use SQLite, MongoDB, or different PostgreSQL schema names
- **Auth** — source may have its own auth, or no auth
- **Package manager** — source may use Yarn instead of npm
- **Schema naming** — source names become target-app names in the living-spec decisions log

### Step 4 — Run the absorption as a net-new convoy in the target app

Only after the discovery convoy is complete and approved at Gate 1.

---

## Standards Reference

Standards files in `conduit/standards/` encode team patterns and gotchas. Agents load these during Stage 3. Humans update them when new issues are discovered.

| File | When to read |
|---|---|
| `tool-use.md` | **Read first on any new machine or when unsure which tool to use** — git worktrees, Claude tools, npm patterns, WIP limits, model selection |
| `auth-patterns.md` | Any work touching authentication or session handling |
| `drizzle-patterns.md` | Any database schema work or migrations |
| `naming-conventions.md` | New tables, API routes, component names |
| `ai-app-standards.md` | Any AI feature (help, feedback, model API calls) |
| `tech-stack.md` | Evaluating dependencies or new tools |
| `sveltekit.md` | Any SvelteKit build or test work |

---

## Quick Reference — File Locations

```
conduit/
  .conduit/config.yaml          ← Your local config (gitignored)
  convoys/
    active/[id]/
      convoy.yaml               ← Stage, status, gate history
      living-spec.md            ← Intent, ACs, decisions log
  directives/net-new/stages/    ← Stage directive files (paste into Claude)
  standards/                    ← Team patterns and gotchas
  highway-index/                ← Registry of all repos on the Conduit network
  scripts/                      ← Automation scripts

each-managed-repo/
  CONDUIT.md                    ← Repo signals (what agents may/must not do)
  CONTEXT.md                    ← Living architecture summary
  QA/ACCEPTANCE.md              ← Criteria registry and test case mapping
```

---

## Common Mistakes

| Mistake | Correct approach |
|---|---|
| Starting a convoy without Highway Init on the target repo | Always init the repo first |
| Absorbing a source repo without reading it first | Run a discovery convoy on the source first |
| Committing mid-work | Commit at gate boundaries only |
| Approving a gate without reviewing the gate checklist | Read the pre-gate checklist in the directive |
| Having the Code window commit independently | Conduit window owns commits; Code window implements |
| Running `npm test` without `npx svelte-kit sync` first (SvelteKit repos) | Always sync before test in a fresh shell |
| Adding `-AsArray` to `ConvertTo-Json` in PowerShell scripts | Machine runs PS5 — `-AsArray` is PS7 only; build JSON strings manually |
