<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/net-new/stages/01-ba-requirements.md
# description: Stage 1 BA Requirements directive. Full requirements, no solution.
# owner:       HUMAN
# update:      Manual when requirements policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Requirements only — no solution design.** Complete living-spec.md ACs in Given/When/Then, plus Out of Scope (min 2) and Dependencies (unavailable = BLOCKER).
- **Run the compliance screening first** (adapt to your org's regulatory needs) — any "yes" escalates before Gate 1.
- **Coverage:** happy path per use case, unhappy path per error condition; if the Epic is vague, run `ba-brain-dump.md` first.
- **Avoid:** solution bleed, untestable or implementation-specific criteria, assumed dependencies.

# Stage 1 — BA Requirements Directive (Net New)

## Recommended Model
**claude-sonnet-4-6** — Requirements generation requires systematic thinking, structured output, and business logic reasoning. Haiku will miss edge cases. Opus is unnecessary unless the domain is complex (regulated data, multi-system integrations, financial calculations).

## What This Stage Produces
1. `living-spec.md` — Acceptance Criteria section complete, all criteria in Given/When/Then format
2. Documented edge cases and explicit out-of-scope items
3. Identified dependencies (other systems, data sources, upstream services)

## Context to Load
- `living-spec.md` — Intent and Audience Impact sections
- `CONDUIT.md` — Repo Signal block only
- `CONTEXT.md` — Module/Service Map section only (understand what exists; do not load full architecture)

## Optional Pre-Step — BA Brain-Dump Flow

If the requirement description is vague, sparse, or empty at Stage 1, run the guided brain-dump flow in [`directives/shared/ba-brain-dump.md`](../../shared/ba-brain-dump.md) before writing acceptance criteria. The flow prompts the BA for free-form input, organizes it into labeled sections, surfaces clarifying questions, and records the result. The organized output then feeds the steps below. Skip this pre-step if the requirement already has well-formed requirements.

## Step-by-Step Instructions

### Step 1 — Read and validate the Stage 0 output
Read the living-spec.md Intent and existing acceptance criteria skeleton from Stage 0. Identify:
- Any criteria that are not testable (vague statements → rewrite as Given/When/Then)
- Any gaps (user flows not yet covered)
- Any ambiguities that need resolution before design begins

Do not proceed if the Intent section is incomplete. Flag and return to Stage 0 gate review.

### Step 2 — Generate complete acceptance criteria
For each user-facing behavior the feature must support, write a criterion:

```
Given [a specific user state or precondition]
When [the user takes a specific action]
Then [the system produces a specific, verifiable outcome]
And [additional verifiable outcomes if applicable]
```

Coverage requirements:
- Happy path (primary use case): at minimum 1 criterion per stated use case
- Error states: at minimum 1 criterion per error condition (invalid input, unauthorized access, service unavailable)
- Edge cases: any boundary conditions explicitly listed in the Intent

Do NOT write implementation-specific criteria ("the button is blue" is not an acceptance criterion — "the user can clearly distinguish the primary action from secondary actions" is).

### Step 3 — Define explicit out-of-scope items
List what this feature deliberately does not do. Out-of-scope is as important as in-scope — it prevents scope creep in Stage 3.

Format:
```
Out of Scope:
- [Specific capability] — reason: [why it is excluded from this Convoy]
```

Minimum 2 explicit out-of-scope items. If you cannot think of 2, the scope is either perfectly bounded (document that) or you have not thought carefully about the edges.

### Step 4 — Identify dependencies
List any external systems, data sources, or upstream services this feature requires:
- External APIs, auth providers, or third-party services
- Database tables or schemas that must exist before implementation begins
- Other features that must be deployed first

Flag any dependency that is not yet available as a BLOCKER.

### Step 5 — Update living-spec.md
Write the following sections:
- **Acceptance Criteria**: complete, all in Given/When/Then
- Add an **Out of Scope** subsection under Acceptance Criteria
- Add a **Dependencies** subsection

Set stage to `1` in the living-spec.md header.

## Compliance Screening

Before writing acceptance criteria, complete a compliance screening (adapt the questions to your org's regulatory needs). Answer yes/no for each area that applies to your domain. Any "yes" answer requires escalation to the responsible owner before Gate 1 can be approved.

Generic areas to consider (extend or replace for your context):

| Area | Question | Escalation Owner |
|------|----------|--------------------|
| Financial / regulated data | Does this convoy touch regulated financial or advisory data? | Compliance owner |
| Payment data | Does this convoy process, store, or transmit payment card data? | Legal / Security owner |
| Personal data (PII) | Does this convoy collect, store, or process personally identifiable information? | Security owner |
| Audit / reporting | Does this convoy affect systems used for financial reporting or audit trails? | Finance / Audit owner |

Record answers in the living-spec.md Compliance Screening section. If no section exists, add one. If your project has no regulatory exposure, note that explicitly and move on.

## Gate 1 Criteria (Pre-Gate Checklist)
Before requesting Gate 1 approval, verify ALL of the following:

- [ ] Compliance screening completed — applicable questions answered; any "yes" escalated to the responsible owner
- [ ] Every acceptance criterion is in Given/When/Then format
- [ ] No criterion is implementation-specific (no UI color, no specific variable names)
- [ ] No criterion is untestable ("system is fast" → must specify measurable threshold)
- [ ] At least 1 criterion covers the unhappy path (error, invalid input, unauthorized)
- [ ] Out-of-scope list has at least 2 items
- [ ] All dependencies are listed and none are BLOCKERS (or BLOCKERS are documented and accepted)
- [ ] No solution design has entered this stage — requirements only, no How

## Common Failure Modes
- **Premature solution bleed**: writing "the system will use a PostgreSQL JOIN to..." in requirements. This is Stage 2 territory.
- **Vague criteria that cannot be tested**: "The user should have a good experience" is not a criterion.
- **Missing error states**: Happy-path-only requirements leave Stage 3 developers guessing what to do when things go wrong.
- **Assumed dependencies**: Assuming a table or API exists without verifying.

## Reference Standards

- **AI-integrated apps**: load `standards/ai-app-standards.md` and verify all 4 required features (persona/instructions, feedback reporter, help page, live/mock indicator) are represented in the acceptance criteria before Gate 1.
- **New app setup**: load `standards/naming-conventions.md` to ensure repo names and any infrastructure resource names follow your conventions before any resources are proposed or created.

## What to Escalate
- Requirement conflicts between two stakeholder groups → escalate to `owner`
- Requirement implies a compliance or legal consideration → escalate to `security` and `compliance`
- Requirement scope has grown 50%+ from the original Intent → escalate to `owner` for re-scoping
