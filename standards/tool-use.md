<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/tool-use.md
# description: Standard tool selection for Conduit convoys and skills.
#              Every tool choice eliminates a specific waste. Use this
#              as the decision guide before reaching for any tool.
# owner:       HUMAN
# update:      When new tools are adopted or patterns are validated/invalidated.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Dedicated tools over Bash:** Read/Glob/Grep for files; Edit (after Read) over Write; Agent only for open-ended exploration (or >~10 files).
- **Git:** branches `feature/{work-item-id}`, max lifetime one stage; implementation agents never commit — the Conduit window commits at gate approval; worktrees for two-window convoys.
- **npm:** `npm ci` in fresh checkouts and pipelines; npm only — no yarn/pnpm.
- **Models:** Sonnet default, Opus for security/auth/migrations, Haiku never for implementation.
- **WIP limits:** 1–2 active convoys, 3 open PRs, one branch per convoy, one stage in flight.

# Tool Use Standards

> Every tool choice is a process decision. The right tool eliminates waste.
> The wrong tool creates it — rework, motion, waiting, defects.
> This file tells you which tool to use and why.

---

## Claude Code Tools (for agents and skills)

### Reading files

| Situation | Tool | Waste eliminated |
|---|---|---|
| Read a known file at a known path | `Read` | Eliminates the overhead of spawning a shell process |
| Find files matching a pattern | `Glob` | Eliminates manual `find` invocations, consistent results |
| Search file contents for a keyword | `Grep` | Eliminates reading entire files to find one thing |
| Never | `Bash cat`, `Bash find`, `Bash grep` | These bypass the optimized dedicated tools |

**Rule:** If a dedicated tool exists, use it. Reserve `Bash` for system operations that have no dedicated tool equivalent.

---

### Searching the codebase

**Use `Grep` when:** You know what you're looking for. A class name, function, import, pattern.
```
Grep for "useCapacityStore" in *.ts files → returns exact matches fast
```

**Use `Agent(Explore)` when:** You don't know what you're looking for. You need to understand how something works, find all callers, or explore an unfamiliar module.
```
"How does authentication flow through this codebase?" → Agent, not Grep
```

**Waste:** Reaching for Agent when Grep would do it in one call adds latency and burns context. Reaching for Grep when the question is open-ended produces shallow, incomplete answers.

---

### Editing files

| Situation | Tool | Why |
|---|---|---|
| Modify an existing file | `Edit` | Sends only the diff — minimal context, lower error rate |
| Create a new file | `Write` | Full file content, no prior state needed |
| Never rewrite a file you could edit | `Write` on existing file | Loses the diff — harder to review, easier to introduce errors |

**Rule for Edit:** Always `Read` the file first. Edit will fail if you haven't read it. This is intentional — it prevents editing files you haven't seen.

---

### Running work

**Use `Bash` for:**
- Build commands (`npm run build`, `npm run test`, `tsc --noEmit`)
- Git operations (`git status`, `git log`, `git diff`)
- System operations (creating directories, checking environment)
- Work-tracker script execution (`bash scripts/move-gate-cards.sh`)

**Use `Agent` for:**
- Tasks that require multiple rounds of search → read → search (open-ended exploration)
- Tasks that would consume too much of the main context window if done inline
- Parallel independent research (two Agent calls in one message run concurrently)

**Run agents in the background when:** You have genuinely independent work to do while waiting. Don't poll. You'll be notified when it completes.

**Never use Agent for:** Tasks you can do yourself in 1–3 tool calls. Overhead is real.

---

### Writing todos

Use `TodoWrite` for multi-step work within a single session. It keeps your progress visible and prevents skipping steps under time pressure. Mark each item complete immediately when done — not in batches.

Do not save session state to memory — memory is for cross-session facts, not current task tracking.

---

## Git Worktrees

### What worktrees eliminate

A worktree is a second checked-out copy of the same repo, on its own branch, in a separate directory. Both copies share the same `.git` history — no duplication, no sync required.

Without worktrees in a two-window session: both windows share one working tree. The Code window's uncommitted changes are visible to (and can confuse) the Conduit window. Branch switches require stashing or committing. Skills that create a branch can't be run while you're already on a feature branch.

With worktrees: each window works in complete isolation. No stashing, no conflicts, no bleeding state.

### When to use worktrees

**Use a worktree when:**
- You are running a two-window convoy (Stage 3 optimization). The Code window gets a worktree; the Conduit window stays on master.
- You are running a skill (spacework, spaceprwork) that needs to create and work on a feature branch while the rest of your session stays on master.
- You need to investigate a bug on a different branch without disturbing in-progress work.
- The `Agent` tool is invoked with `isolation: "worktree"` — use this for experimental changes that may not pan out.

**Do not use a worktree when:**
- Single-window convoy. There's no second context to isolate. The overhead isn't worth it.
- The work is a one-file edit with immediate commit. Too lightweight to justify setup.

### Worktree workflow for two-window convoys

**Conduit window (stays on master):**
```bash
# No worktree setup needed. Conduit window reads convoy state, runs scripts, commits.
```

**Code window (enters worktree for Stage 3):**
```bash
# Create worktree on the feature branch for this convoy's story
git worktree add ../myapp-feature-117504 feature/117504

# Work entirely in ../myapp-feature-117504
# Never commit here — report output to human, Conduit window commits
```

**After Gate 3 approval (Conduit window):**
```bash
# Conduit window merges or PRs from the worktree branch
# Then removes the worktree when the story closes
git worktree remove ../myapp-feature-117504
git worktree prune
```

### Worktree workflow for skills (spacework pattern)

Skills that create a feature branch should always use a worktree so the developer's main session is undisturbed:

```bash
# Inside a skill — create worktree for the new branch
git worktree add ../[repo]-feature-[id] feature/[id]

# Do all implementation in the worktree
# Push from the worktree
# Create PR from the worktree branch

# On completion
git worktree remove ../[repo]-feature-[id]
```

### Claude Code's EnterWorktree tool

When using `Agent` with `isolation: "worktree"`, Claude Code creates and manages the worktree automatically. Use this for:
- Experimental refactors you might discard
- Trying two approaches and comparing results
- Any Agent task that writes files and might need to be rolled back

The worktree is cleaned up automatically if no changes were committed. If changes were made, the worktree path and branch are returned for you to review and merge.

---

## Git Workflow Patterns

### Branch naming

Always: `feature/{work-item-id}` — e.g. `feature/117504`

This creates a permanent, auditable link between the git branch and the work item in your tracker. Do not use descriptive names, initials, or dates — they break the traceability chain.

### Branch lifetime

**Maximum branch lifetime: one convoy stage.** A feature branch should be created, implemented, reviewed, and merged within Stage 3. Long-lived branches are inventory waste — they accumulate merge conflicts and drift from master.

**If Stage 3 spans multiple sessions:** The branch lives until Gate 3. That's expected. What's not acceptable: branches that survive multiple gates, or branches that exist with no active convoy behind them.

### Commit discipline

Conduit's rule: **the implementation agent never commits.** The Conduit window commits at gate approval.

This is not bureaucracy — it eliminates the defect of "agent commits partial work, gate history diverges from git history." Every commit in a Conduit-managed repo should map to a gate event.

Commit message format:
```
Gate N approved: [one-line summary]

[Optional: what changed, why it deviated from design]
```

### Stashing vs WIP commits

**Use `git stash`** for mid-session saves within a single working session when you need to switch context briefly and return.

**Use a WIP commit** (`wip: [description]`) only if you need to leave work in place across multiple days. Never push WIP commits to origin — rebase them before the gate commit.

**Never stash across sessions.** Stashes are invisible to other tools, not tracked in history, and silently dropped by some git operations. Anything that needs to survive overnight is a WIP commit or a completed piece of work.

### Keeping master clean

- Never commit directly to master from a Code window
- Never force-push master
- Never merge without a passing build (the pipeline enforces this, but don't rely on it alone — run `npm run test` locally first)

---

## npm / Node Patterns

| Situation | Command | Why |
|---|---|---|
| First install in a fresh checkout | `npm ci` | Respects `package-lock.json` exactly — reproducible |
| Adding/updating a dependency | `npm install [package]` | Updates lock file intentionally |
| CI/CD pipeline | `npm ci` | Never `npm install` in pipelines — lock file drift is a defect |
| Before running tests in a fresh shell (SvelteKit) | `npx svelte-kit sync && npm run test` | `.svelte-kit/tsconfig.json` is generated at sync time |
| Checking types without building | `npm run typecheck` or `tsc --noEmit` | Faster feedback loop than a full build |

**Package manager:** This project uses `npm`. Do not introduce `yarn` or `pnpm` without a convoy and a standards update here. Mixing package managers creates lock file conflicts and CI failures.

---

## WIP Limits

Waste accumulates when too much work is in flight. Conduit's guidance:

| Level | Limit | Rationale |
|---|---|---|
| Active convoys per developer | 1–2 | More than 2 means context-switching costs exceed parallelism gains |
| Open PRs per developer | 3 | PRs sitting unreviewed are inventory — they rot |
| Open feature branches | = active convoys | One branch per convoy. Extras are signals of abandoned work |
| Stages in flight per convoy | 1 | You cannot be in Stage 3 and Stage 5 simultaneously — this isn't allowed by the gate model anyway |

**When you hit the limit:** Finish something before starting something. Pull, don't push. Merge open PRs before creating new branches. Close or kill abandoned convoys.

---

## Pipeline Patterns

### Skip unnecessary work

**Terraform:** Only runs when `infra/` or the pipeline file changes. Code-only changes skip straight to Build → MigrateDb → Deploy. Implement change detection in your pipeline definition.

Apply the same pattern to any new pipeline: detect what changed, skip what didn't. Every unnecessary pipeline stage is waiting waste.

### Fail fast

Order pipeline stages so the cheapest, most likely to fail checks run first:
1. Type check + lint (seconds, catches most developer errors)
2. Unit tests (seconds to minutes)
3. Build (minutes)
4. Integration / migration (minutes, requires infra)
5. Deploy (minutes, irreversible)

Never run deploy before tests pass. Never run migration before build succeeds.

### Database firewall pattern

A CI runner often cannot reach a managed database by default. The pattern:
1. Get the runner's egress IP from `checkip.amazonaws.com`
2. Add a firewall/allowlist rule — wait briefly for propagation
3. Run migration
4. Remove the firewall rule in an always-run cleanup step

Always run the cleanup step unconditionally. If migration fails, the firewall must still close. Leaving it open is a security defect.

---

## Model Selection and Context Window Management

### Model selection

Conduit directives specify which model to use at each stage. This is standard work — not a preference.

| Model | When to use |
|---|---|
| `claude-sonnet-4-6` | Default for all implementation, design, QA, and most analysis |
| `claude-opus-4-6` | Security-sensitive code, auth flows, cryptography, production data migrations, threat modeling |
| `claude-haiku-4-5` | Never in Conduit convoys — too lightweight for implementation work |

**Cost discipline:** All models share the same 200K token context window — switching models does not change how much you can load. What it does change: Opus is more verbose (consumes more window per exchange) and costs more per token. Use Sonnet by default. Upgrade to Opus when the cost of a wrong answer (a broken auth flow, a bad migration) exceeds the cost differential — for security work, it always does.

### Extending your working window

The context window is fixed. These are the real levers:

| Technique | What it does | Where Conduit uses it |
|---|---|---|
| **Stage boundaries** | Each stage starts a fresh session — context never accumulates across all 9 stages | Built into the convoy model |
| **brief.md** | Single-paste session resumption — no re-explanation overhead | Every convoy |
| **CONTEXT.md** | Compresses the entire repo's architecture into one loadable file | Highway init on all repos |
| **Subagents (`Agent` tool)** | Heavy exploration (reading 30 files) runs in a subprocess; only the summary returns | Use for open-ended codebase research |
| **`disable-model-invocation: true`** | Prevents skills from spawning sub-models — keeps token cost predictable | All skills |
| **Worktrees** | Implementation agent works in isolation — Conduit window stays lean | Two-window Stage 3 |

**Practical rule:** When you find yourself loading more than ~10 files to answer a question, reach for `Agent(Explore)` instead. Let the subagent read and summarize; keep your main window for decisions and code.
