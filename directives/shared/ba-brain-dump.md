<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/ba-brain-dump.md
# description: BA brain-dump flow — guided front-end for messy, ambiguous Stage 1 intake. Optional pre-step before writing acceptance criteria.
# owner:       BOTH
# update:      When brain-dump protocol or tracker write-back rules change.
# schema:      none
# last_update: 2026-05-27
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- Use this when the work item's description is vague or empty at Stage 1 and the BA needs help organizing their thinking before writing acceptance criteria.
- Four phases: (1) collect free-form brain-dump, (2) organize into labeled sections, (3) surface specific clarifying questions, (4) write organized content back to your tracker on BA confirmation.
- Output feeds into the existing Stage 1 AC process — it does not replace Given/When/Then criteria.
- Never fabricate requirements. Never write to your tracker without explicit BA confirmation. Never run on a work item past Stage 1.

# BA Brain-Dump Flow

## When to Use

Run this flow when:
- A BA is at Stage 1 and the work item's description is vague, sparse, or empty.
- A BA wants to talk through requirements before committing them to tracker structure.
- The BA explicitly asks to "run the brain-dump flow."

Do **not** run this flow if:
- The work item is at Stage 2 or beyond — refuse with: *"This work item is past Stage 1 — brain-dumps happen at Stage 1. Use `conduit plan` for Stage 2 content."*
- The work item's description already contains well-formed acceptance criteria — proceed directly to Stage 1 rather than re-dumping.

---

## Phase 1 — Brain-Dump Prompt

Invite the BA to speak freely. Do not try to structure input prematurely.

**Agent prompt to BA:**
> *"Tell me everything you know about this feature — requirements, constraints, edge cases, stakeholders, what could go wrong, things that are out of scope. Don't worry about structure; just talk. I'll organize it afterward."*

Accept multi-message input without interrupting. Do not summarize or reframe mid-dump. Do not ask clarifying questions during the dump phase — let the BA finish first.

**If the BA sends a single terse message** (e.g., "It needs to work" or one sentence), do not fabricate structure. Ask targeted follow-ups instead:
- *"What problem does this solve for the user?"*
- *"What does 'working' look like — what can a user do when it's done that they can't do today?"*
- *"Are there any cases where it should NOT do something?"*

Never invent requirements. If the BA has not stated something, it does not appear in the output.

---

## Phase 2 — Organize

Once the BA signals they are done, produce a labeled-section draft. Every section must contain only content the BA provided. Omit sections entirely if the BA addressed nothing relevant to them — do not pad with placeholders.

**Required sections (include only if addressed by the BA):**

```
## Background
[Why this work is needed; the problem being solved]

## Scope
[What this feature covers — what a user can do when it's done]

## Out of Scope
[What this feature deliberately does not do]

## Requirements
1. [Requirement — numbered, plain language, testable behavior]
2. ...

## Edge Cases
[Boundary conditions, unusual inputs, concurrent scenarios]

## Assumptions
[Things taken as true without explicit stakeholder confirmation]

## Open Questions
[Unknowns that must be resolved before or during Stage 1]

## Proposed Implementation Notes
[Solution ideas or technical preferences the BA mentioned — isolated here so they do not bleed into Requirements]
```

**Solution bleed rule:** If the BA mentions a specific technology, architecture, or implementation approach (e.g., "use a Redis cache", "add a column to the users table"), capture it under **Proposed Implementation Notes** — not under Requirements. The Stage 1 "no solution bleed" rule still wins.

**Merge rule:** If the work item already has content in its description from an earlier Stage 1 pass, read it first and incorporate it into the organize step. The output is a merge, not a replace — prior work is not discarded.

---

## Phase 3 — Gap Analysis

After producing the organized draft, surface specific clarifying questions. Each question must be actionable and tied to a concrete development concern.

**Required coverage — check all four areas:**

1. **Missing error states** — For each requirement, is there a corresponding failure/error case? If not, ask.
2. **Undefined unhappy paths** — What happens when a precondition is not met, a service is unavailable, or a user provides invalid input?
3. **Undefined acceptance criteria** — For each listed requirement, can a developer verify completion? If not, surface the gap.
4. **Unstated dependencies** — Does any requirement imply an external system, data source, or upstream feature that has not been named?

**Format for each question:**
> `[Question] — [Why this matters for development]`

**Example:**
> *"What happens if the work tracker is unavailable when the BA confirms? — Developers need to know whether to halt, retry, or fall back to a copy-paste path so they can implement error handling."*

Mark at least one question as **BLOCKING** (must be resolved before Gate 1). If no questions are blocking, say so explicitly.

---

## Phase 4 — Write-Back

Present the organized content to the BA and ask for confirmation before writing anything to your tracker.

**Agent prompt:**
> *"Here is the organized draft. Does this capture your intent accurately? If you confirm, I'll update the work item's description. If you want to adjust anything, tell me and I'll revise before writing."*

**On BA confirmation:**
1. Update the work item's description field with the organized content rendered as markdown, via your tracker (MCP, CLI, or REST).
2. For each child work item that has description content from this session, update its description via the same path.
3. If your tracker is unavailable, halt and report:
   > *"I can't reach your tracker right now. Here is the organized content — paste it into the work item's description directly, then re-run this step when the tracker is available."*
   Return the full organized content in-message so nothing is lost.

**On BA abort (cancel before confirmation):**
Discard the in-progress organized content. Write nothing to your tracker. Do not log the draft.

---

## What This Flow Produces

The brain-dump output is a **pre-step input** to Stage 1, not a replacement for it. After write-back completes:
- The BA has a well-organized work item description in the tracker.
- Open questions are visible for the Stage 1 AC session.
- The agent and BA proceed to Stage 1 acceptance criteria using the standard Given/When/Then format per `directives/net-new/stages/01-ba-requirements.md`.

The organized content does **not** constitute acceptance criteria. Gate 1 still requires AC in Given/When/Then format.
