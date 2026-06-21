<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/brainstorming.md
# description: Intent-before-implementation exploration directive. Upstream of `conduit plan`.
# owner:       BOTH
# update:      Manual — approved policy changes only.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Load before building or modifying behavior when intent is not yet committed to `living-spec.md`** — runs upstream of `conduit plan`. Skip if intent + acceptance criteria already exist.
- **Run four passes in order, no skipping:** Requirements → User intent → Design tradeoffs → Document in `living-spec.md` (Intent paragraph + ≥3 binary acceptance criteria).
- **Surface 2–3 candidate approaches with tradeoffs** and recommend one — never single-solution thinking or rubber-stamping the literal request.
- **Do not run `conduit plan init`** until Intent and Acceptance Criteria are written. If scope stays ambiguous after 1–2 rounds, stop and ask — never invent intent.

# Brainstorming — Intent Before Implementation

> **Load this directive when:** a developer asks Claude to build a feature, add functionality, or modify behavior, and the intent has not yet been committed to a living-spec. This runs **upstream of `conduit plan`** — brainstorming explores what to build and why; planning commits to how.

## Purpose

Creative work fails when implementation starts before intent is clear. Brainstorming resolves that gap. The output of this exploration feeds the Intent and Acceptance Criteria sections of `living-spec.md`, which then become the input to `conduit plan`. If you cannot state the intent in one paragraph and list three acceptance criteria, you are not ready to plan.

## When to use

- **Pre-convoy:** A developer has a fuzzy idea and needs to sharpen it before opening a convoy.
- **Stage 0 → 1 transition:** Intake is complete, but Requirements are not yet written.
- **Mid-convoy scope shift:** New information has arrived that changes what the feature should do; re-brainstorm before re-planning.

**Do not use** when the intent is already committed and you are just deciding how to implement. That is `conduit plan` territory, not this directive.

## Step-by-step exploration protocol

Work through these four passes, in order. Do not skip passes.

### Pass 1 — Requirements

Ask, or derive from the conversation:
- What problem is this feature solving? State the problem, not the solution.
- Who is the primary user? What are they trying to accomplish?
- What does "done" look like? What is the observable change?

Output: a one-paragraph problem statement and a user story.

### Pass 2 — User intent

Probe deeper than the literal request:
- What unstated assumptions is the user making?
- What would a user-hostile interpretation of this request look like? (Surface the interpretations to avoid.)
- Is the user asking for a symptom fix, or a root-cause fix? Which is actually needed?

Output: a disambiguated intent — what the user actually wants, distinguished from what they literally asked for.

### Pass 3 — Design tradeoffs

For each plausible approach, name at least one tradeoff:
- Time: faster now vs. slower but more maintainable later.
- Scope: narrow and shippable vs. broad and complete.
- Dependencies: leverage existing code vs. introduce a new abstraction.
- Reversibility: easy to undo vs. locked in.

Output: two or three candidate approaches with tradeoffs stated. Recommend one. Explain why.

### Pass 4 — Document in `living-spec.md`

Write the output into `living-spec.md`:
- **Intent** section: the one-paragraph problem statement + user story + chosen approach.
- **Acceptance Criteria**: three or more testable, binary pass/fail criteria.

If no convoy exists yet, draft these in a working note and include them in the convoy intake when one is created.

## Relationship to `conduit plan`

Brainstorming ends where `conduit plan` begins. The handoff contract:

| Brainstorming produces | `conduit plan` consumes |
|---|---|
| Intent paragraph in `living-spec.md` | Requirements section (EARS-formatted) |
| Acceptance Criteria list | Per-task acceptance checklist |
| Chosen approach + rationale | Impact Map and Task Graph |
| Ruled-out alternatives | Design Decisions (noted as "considered and rejected") |

Do not run `conduit plan init` until brainstorming has written at least the Intent and Acceptance Criteria. Skipping this step produces plans that get rewritten at Stage 2 — wasted effort.

## Anti-patterns

- **Jumping to code.** Writing implementation before the intent is committed. If you find yourself asking "which file should I edit," you have skipped brainstorming.
- **Single-solution thinking.** Presenting only the first approach that comes to mind. Always surface two or three and pick one explicitly.
- **Rubber-stamping the literal request.** If the user asks for a button, do not build a button. Ask what the button is for, then decide if a button is the right answer.
- **Treating acceptance criteria as optional.** If a criterion cannot be tested (binary pass/fail), rewrite it until it can.
- **Skipping Pass 2.** The literal request and the actual intent diverge more often than feels comfortable. Pass 2 is not optional.

## Escalation

If brainstorming surfaces a genuine scope ambiguity that you cannot resolve in one or two rounds of questioning, stop and surface it to the human. Do not invent an intent. State what is ambiguous, offer two or three possible intents, and ask which one fits.
