<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/net-new/stages/03-implementation.md
# description: Stage 3 Implementation directive. Code, tests, living spec update.
# owner:       HUMAN
# update:      Manual when implementation policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Do NOT commit or push** — the Conduit window commits after gate approval. (For cross-machine peer review, push a `review/<convoy-id>` branch only.)
- **Pre-flight:** STOP if CONDUIT.md or CONTEXT.md is missing; read full context before any code.
- **Follow the repo's established patterns** (e.g. for a web app: schema → API route → page → nav); access data only through the repo's data layer, keep server-only code server-side, never hardcode secrets, prefer strict typing.
- **One unit test per AC** (incl. unhappy paths); run the repo's framework sync step before tests if it has one. Log deviations in the Decisions Log; update CONTEXT.md if architecture changed.

# Stage 3 — Implementation Directive (Net New)

## ⚠ COMMIT DISCIPLINE

**Do NOT commit or push.** Complete all work, report results to the human, then wait for gate approval. The Conduit window commits after the human approves. If you are working in a repo without an active convoy, this rule does not apply.

## Recommended Model
**claude-sonnet-4-6** — Primary implementation model. Complex code generation, multi-file changes, reasoning about existing patterns. Do not use Haiku — implementation errors are expensive to catch at Stage 4.

Upgrade to **claude-opus-4-6** when:
- Implementing security-sensitive code (auth flows, permission checks, data validation at trust boundaries)
- Writing a database migration that affects existing production data
- Implementing cryptography or token handling

## What This Stage Produces
1. Working code that satisfies all acceptance criteria from Stage 1
2. Unit tests covering each acceptance criterion
3. Updated `living-spec.md` — Decisions Log entries for any implementation decisions
4. Updated `CONTEXT.md` if the implementation changes the architecture described there

## Context to Load
- `living-spec.md` — full (Intent, Acceptance Criteria, Solution Design, Work Streams)
- `CONDUIT.md` — full
- `CONTEXT.md` — full
- `ACCEPTANCE.md` — full (this is your primary checklist)
- `standards/tool-use.md` — tool selection reference (git worktrees, Claude tools, npm patterns)

**Also check for `convoys/active/[convoy-id]/brief.md`** — if it exists, load it first for a fast summary of current state before loading full docs.

## Git Worktree — Two-Window Setup (read this before starting)

If you are the **Code window** in a two-window convoy, work in an isolated git worktree — not the main checkout. This eliminates branch conflict waste and keeps the Conduit window's view of master clean.

**Set up your worktree before touching any code:**
```bash
# Run from the target repo root
git fetch origin
git checkout master && git pull

# Create a worktree for this story's branch
git worktree add ../[repo]-feature-[story-id] feature/[story-id]

# From this point forward, work in ../[repo]-feature-[story-id]
# Never work in the main checkout during this stage
```

**When you finish and report to the human:**
- Do not commit — the Conduit window commits at gate approval
- Leave the worktree in place until Gate 3 is approved
- After approval, the Conduit window will merge and run: `git worktree remove ../[repo]-feature-[story-id]`

**Single-window convoy:** Skip the worktree setup. Work directly in the repo. The isolation benefit only applies when two windows share the same repo simultaneously.

See `standards/tool-use.md` → Git Worktrees for the full reference.

---

## Pre-Flight: Highway Check (ALWAYS run first)

Before loading any context, verify the target repo has been highway-initialized:

```
Does CONDUIT.md exist in the repo root?
Does CONTEXT.md exist in the repo root?
```

**If either is missing:**
1. STOP immediately. Do not write any code.
2. Tell the human: "This repo is missing highway files. Run `conduit highway init [path]` or answer the questions in `conduit/templates/highway-init-questions.md` and I will create them."
3. Do not proceed until both files exist.

**If both exist:** Continue with Step 1 below.

## Step-by-Step Instructions

### Step 1 — Read the full context before touching code
Read ALL loaded documents in this order:
1. `CONDUIT.md` — understand what you are and are not permitted to do in this repo
2. `CONTEXT.md` — understand current architecture, data flow, auth model, known issues
3. `living-spec.md` — understand what to build and the exact acceptance criteria
4. `ACCEPTANCE.md` — the QA contract you must satisfy

Do not write a single line of code before completing this step.

### Step 2 — Follow the repo's established module pattern
Build new modules in the order the repo's stack dictates, working from the data layer
outward. For a typical web app that means:

```
1. Schema first: define/extend the data model → run the migration
2. API/server layer second: add the route/handler → go through the data layer, never raw SQL
3. UI third: build the page/view + its server load
4. Navigation last: wire it into the app nav with the appropriate access gate
```

**Never skip schema-first.** Building the UI before the data model is stable causes rework.
For a non-web repo (CLI, library, service), follow the analogous bottom-up order its CONTEXT.md describes.

### Step 3 — Code standards (non-negotiable)
- All data access goes through the repo's data layer — never open raw connections from request handlers
- Keep server-only code server-side — never import server modules from client-side code
- Check auth at the request boundary — derive the user from the trusted server context, never from the request body
- No secrets in code — keep connection strings, client secrets, and API keys in local env files / a secret store only
- Prefer strict typing — no untyped escape hatches without explicit comment justification
- For auth implementation details, see `standards/auth-patterns.md`
- For data-layer patterns and migration workflow, see `standards/drizzle-patterns.md`

### Step 4 — Write unit tests for every acceptance criterion
For each Given/When/Then criterion in the living-spec.md:
- Write a test case that verifies the Then clause
- Test the unhappy path (error conditions)
- Use existing test patterns from the codebase

Test file location: mirror the source file path with `.test.ts` suffix.

**SvelteKit repos — run `svelte-kit sync` before first test run:**
```bash
npx svelte-kit sync && npm run test
```
`tsconfig.json` extends `.svelte-kit/tsconfig.json` which is generated at dev/sync time. In any fresh shell or CI environment this file won't exist and tests fail with confusing path alias errors. See `standards/sveltekit.md` for full details and all SvelteKit-specific patterns.

### Step 5 — Update living-spec.md during implementation
When any implementation decision differs from the Stage 2 design:
- Log it in the Decisions Log with rationale
- Flag it in the checkpoint notes
- If the deviation is significant, request a mini Gate review before proceeding

Set stage to `3` in the living-spec.md header. Update `last_updated` date.

### Step 6 — Update CONTEXT.md if architecture changed
If the implementation adds new tables, new routes, or changes the data flow described in CONTEXT.md:
- Update the relevant sections
- This update must be approved by the human reviewer at Gate 3

## Gate 3 — Enabling Cross-Machine Peer Review

The "do not commit" rule means do not commit to master before gate-3. For peer reviewers on a different machine, push a `review/` branch so they can clone it, run the test suite, and read the actual source. This is required for a genuine four-eyes review.

```sh
# From the implementation repo (while still on master with uncommitted work):
git checkout -b review/<convoy-id>
git add <implementation files only>
# Exclude: events.jsonl, sessions/, unrelated skill/config changes
git commit -m "conduit: review branch for <convoy-id> gate-3"
git push origin review/<convoy-id>
git checkout master   # return to master — uncommitted work stays in working tree
```

The `conduit-peer-approve` skill detects this branch automatically. If no `review/<convoy-id>` branch exists on origin when the skill runs, it will stop and give you the exact commands above.

The review branch is deleted after gate-3 approves (squash-merge to master supersedes it).

**If your workflow already pushes a feature branch with the implementation on the remote:** skip this section — the feature branch already serves the peer-review purpose.

## Gate 3 Criteria (Pre-Gate Checklist)
Before requesting Gate 3 approval, verify ALL of the following.

Items prefixed with `**<check-id>**:` are auto-executable by `conduit pre-gate` (CLI-2);
the rest remain manual review items per AC-9 backward-compat.

- [ ] Every acceptance criterion has at least one test case
- [ ] **tests**: All tests pass locally (`npm run test`)
- [ ] TypeScript compiles without errors (`npm run typecheck` or `tsc --noEmit`)
- [ ] **lint**: Linter passes (`npm run lint`)
- [ ] **console-log-audit**: No `console.log` statements left in production code paths
- [ ] No secrets or credentials in code or comments
- [ ] Schema-first pattern followed (if applicable)
- [ ] All DB access goes through the db index, not direct imports
- [ ] CONTEXT.md updated if architecture changed
- [ ] Decisions Log updated for any deviations from Stage 2 design
- [ ] **commented-code-audit**: No commented-out code blocks left in the diff

## Common Failure Modes
- **Ignoring CONTEXT.md**: Reimplementing patterns that already exist, causing inconsistency.
- **Page-before-schema**: Building the UI before the data model is stable forces rewrites.
- **Client-side DB imports**: Leaking server-only types or connections to the browser.
- **Tests that only test the happy path**: Error states are where bugs live.
- **CONTEXT.md drift**: Implementing something that changes the architecture without updating CONTEXT.md.

## What to Escalate
- Implementation reveals the Stage 2 design was materially wrong → pause, escalate to `architect`, request mini-gate before continuing
- Security-sensitive code is more complex than expected → escalate to `security` for guidance before implementing
- Implementation requires a new external dependency → escalate to `architect` for approval before importing
- Test coverage below 80% for business-critical paths → escalate to QA lead
