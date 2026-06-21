# ADR 004 — Plugin Absorption & Always-On Conduit

**Status:** proposed
**Date:** 2026-04-23
**Authors:** Conduit core + Claude (Opus 4.7)

## Context

We ship Conduit as the single authoritative AI-delivery orchestrator for all
engineering work. Today, individual developers augment Claude Code with a
mix of third-party plugins — gastown, GSD, Superpowers, Skill Creator, the
Playwright/QA tooling — each with its own opinionated paradigm, security
surface, and approval flow (or lack thereof). This produces two problems:

1. **Inconsistent governance.** A skill installed from a public plugin
   bypasses security review. Nothing prevents one dev's experimental
   rule from silently affecting their workflow in a way that conflicts
   with team standards.
2. **Skill sprawl.** Every developer's `~/.claude/skills/` looks different.
   When teammates troubleshoot together, a useful skill on one machine is
   missing on another. The team loses the network effect of shared tooling.

We've already shipped the `conduit_skills` table + approval workflow and
(this ADR's predecessor) the `conduit_rules` table with the same workflow.
The surface now exists for the optional registry to be the single source of
truth for *what Claude is allowed to do*. This ADR records the path for
bringing the third-party plugin capabilities into that surface.

## Decision

Conduit will absorb the behaviors of the key third-party plugins — **not
by vendoring code**, but by reimplementing the specific workflows the team
actually uses as native Conduit skills + rules, subject to the same
approval workflow as any other skill. Upstream plugins remain a reference
for ideas, not a runtime dependency.

Second decision: **Conduit is always available on any machine**, not
just when a dev happens to open the conduit repo. The bootstrap shim
(`~/.claude/bin/conduit`) plus the auto-managed `~/.claude/CLAUDE.md`
block already achieve this on any machine that has ever run a conduit
command. A new install script (`scripts/install-conduit.sh`) closes the
zero-to-bootstrap gap for new hires.

## Plugin-by-plugin absorption plan

Each plugin is a separate convoy, scheduled against the priority order
below. No plugin is absorbed wholesale — we take the workflows we use.

### 1. Skill Creator (highest priority, smallest surface)

**What it does:** scaffolds new skills with frontmatter, descriptions,
eval templates.
**What we absorb:** the scaffold template, the eval template, the
description-writing heuristics. **Not** the plugin's own runtime — the
`conduit skill create --with-evals` command already exists and is where
this capability lands.
**Scope:** merge remaining ideas into `conduit skill create`; no new
commands. Approval: existing skill validator.

### 2. Superpowers (medium surface, high value)

**What it does:** brainstorming, subagent-driven development, plan
writing, systematic debugging, test-driven development, verification
before completion, receiving/requesting code review.
**What we absorb:** the *practices* captured as directives, not the
skills. Most of these already exist in `directives/shared/` (debug-protocol,
spec-driven-planning, autonomous-execution, code-review-protocol,
tdd-protocol, verification-protocol). The gap: brainstorming and
receiving-code-review directives.
**Scope:** two new directives (`directives/shared/brainstorming.md`,
`directives/shared/receiving-review.md`), wired into `directives in scope`
in CLAUDE.md. One new skill: `conduit-brainstorm` as a thin launcher.
Approval: via the `conduit rules sync` flow — directives land as drafts
and require admin approval.

### 3. GSD (large surface, partial overlap)

**What it does:** a competing workflow framework with its own phase
model (plan / discuss / execute), code review, UAT, and audit commands.
**What we absorb:** the *commands we don't already have equivalents for*
— specifically the `/gsd-add-todo`, `/gsd-check-todos`, `/gsd-pause-work`,
and `/gsd-resume-work` patterns. Our existing `conduit session save|resume`
handles handoff but doesn't have a todo backlog.
**Scope:** new `conduit todos` command + a thin `conduit-todos` skill.
Explicit non-goal: we do not absorb GSD's competing phase model — it
would fracture the stage-flow contract that's already wired into the work tracker.
Approval: new skill lands as draft, rule changes via rules sync.

### 4. Playwright / QA (medium surface, already partial)

**What it does:** browser automation for visual regression, E2E, a11y.
**What we absorb:** already have `conduit qa` as a wrapper. Gap is the
approval workflow for test baselines — right now a dev can update a
baseline image without team review.
**Scope:** add `conduit qa baseline approve|reject` subcommands backed
by a `qa_baselines` table in conduit-core. Baselines land in the registry
alongside skills + rules for review.

### 5. Gastown (lowest priority, niche)

**What it does:** domain-specific helpers for a particular
industry/vertical that isn't primary to our work.
**What we absorb:** case-by-case only. Nothing by default. If a specific
gastown skill proves valuable in a real session, file it via
`conduit learn skill` as a draft.

## Non-goals

1. **We do not vendor upstream plugin source.** Every absorption is a
   fresh implementation tailored to our context. This guarantees we
   audit each behavior and keeps our supply-chain minimal.
2. **We do not deprecate third-party plugins for individuals.** A dev
   may still use them locally. But any skill they produce that's useful
   to the team must go through `conduit learn` → registry approval →
   `conduit skill install` to reach others.
3. **We do not replicate every plugin feature.** We absorb only what
   shows up in real work. The `conduit_skills` approval surface is
   a natural filter — a capability that nobody files via `conduit learn`
   is a capability that isn't needed.

## Always-on: the three layers

Conduit is reliably "known" to Claude Code in three progressively
stronger ways:

1. **Passive discoverability** — the global `~/.claude/CLAUDE.md` block
   (managed by `ensureClaudeMd`) names Conduit and its shim. Any Claude
   Code session on a bootstrapped machine reads this at session start.
2. **Active skills** — the 14 `conduit-*` skills live in
   `~/.claude/skills/` after `conduit skill install`. They surface in
   Claude Code's available-skills list regardless of the working
   directory.
3. **Rule install** — `~/.claude/conduit-rules/` mirrors the approved
   directive + standard corpus. Claude can reference it on any machine
   without needing the conduit repo itself cloned. (Optional; not all
   users need this.)

For new hires: `scripts/install-conduit.sh` runs all three. For existing
devs: they already have (1); running `conduit skill install` once gives
them (2); running `conduit rules install` once gives them (3).

## Migration & rollout

1. **Phase α (this session):** seed existing skills + rules as approved
   via `--seed-approved` on first sync. Everyone already trusting them
   implicitly gets explicit approval records.
2. **Phase 1:** build the install script + broadcast to the team.
   Measure adoption via the registry's skills and rules owner counts.
3. **Phase 2:** absorb Skill Creator + Superpowers (directives). One
   convoy each. Ships with full approval trail.
4. **Phase 3:** absorb GSD todos + Playwright baselines. Two convoys.
5. **Phase 4:** retrospective. If any third-party plugin still provides
   unique value, file it via `conduit learn` and iterate. Otherwise,
   remove them from the recommended dev setup.

## Consequences

- **Security/governance:** every AI-delivered capability has an
  approval record and an audit trail. No more "Claude did X because a
  random plugin said so."
- **Single source of truth:** the registry is the catalog. A dev onboarding
  sees exactly what the team uses, nothing more, nothing less.
- **Maintenance cost:** we own the skills we absorb. Upstream plugin
  improvements don't flow to us automatically — we watch, re-evaluate,
  and selectively re-absorb. This is the explicit trade-off.
- **Risk:** plugin absorption can become "not invented here." Mitigation:
  the `conduit learn` command makes filing a draft cheap. If a plugin
  has a useful idea we missed, anyone can propose it and the approval
  flow decides.

## Open questions

- **`conduit learn` input source:** currently accepts a local file.
  Do we also want `--from-url` that fetches + parses, or is the filing
  step (Claude composes the content, command records it) sufficient?
- **Rule versioning:** content changes currently invalidate approval.
  Do we want explicit versions + a diff view in the registry UI? The
  schema supports it (`version` column) but the UI doesn't yet render
  diffs.
- **Cross-repo shim bootstrap:** the shim assumes a single conduit
  install per user. If a dev has two checkouts (main + worktree),
  whichever one last ran `conduit` wins. Likely fine; flag if surprises.
