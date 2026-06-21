<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/net-new/stages/02-solution-design.md
# description: Stage 2 Solution Design directive. Approach, risk map, repo touch map.
# owner:       HUMAN
# update:      Manual when design policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Design only — no implementation code.** Produce Solution Design, Decision Impact Statement, Work Streams table (one row per repo), and Decisions Log entries.
- **Read CONTEXT.md in full first**; never contradict existing patterns or technology constraints without flagging a deviation for Architect approval.
- **Flag HIGH-risk decisions in the gate request**; escalate new dependencies, auth changes, and irreversible migrations before Gate 2.
- **Avoid:** missing work streams, invisible dependency additions, designs without a Decision Impact Statement.

# Stage 2 — Solution Design Directive (Net New)

## Recommended Model
**claude-sonnet-4-6** for standard features.
**claude-opus-4-6** when any of the following apply:
- Feature touches authentication, authorization, or session management
- Feature involves financial data, PII, or regulated information
- Feature introduces a new external integration
- Feature requires a schema migration that cannot be reversed
- Solution involves architectural patterns not already in CONTEXT.md

Rationale: Design decisions made here cascade through all remaining stages. A wrong decision at Stage 2 that passes Gate 2 causes Stage 3 rework. Use the more capable model when the cost of a wrong decision is high.

## What This Stage Produces
1. `living-spec.md` — Solution Design section complete
2. Decision Impact Statement (required for Gate 2 approval)
3. Work Streams table — one row per repo that will be touched
4. Decisions Log — at least one entry per major design choice

## Context to Load
- `living-spec.md` — Intent + Acceptance Criteria (full)
- `CONDUIT.md` — full
- `CONTEXT.md` — full (you need the complete architecture picture)
- `ACCEPTANCE.md` — relevant criteria only

## Step-by-Step Instructions

### Step 1 — Read CONTEXT.md in full
Before proposing any design, read CONTEXT.md completely. Identify:
- Existing patterns this feature should follow (data flow, auth model, error handling)
- Existing tables or services this feature will interact with
- Known technical debt that may complicate implementation
- Known failure modes to avoid

Do not propose an approach that contradicts existing patterns without flagging it explicitly as a deviation requiring Architect approval.

### Step 2 — Propose the solution approach
Write a 2–4 paragraph description of how the feature will be implemented. Include:
- Which existing components are used vs. which new ones are created
- Data model changes (new tables, new columns, foreign keys)
- API changes (new routes, modified contracts)
- Auth/permission implications

**Technology constraints** (do not deviate without Architect approval):

Each repo defines its own stack. Load the repo's CONTEXT.md and CONDUIT.md for
its stack-specific constraints (framework, database, auth model, deployment target)
before proposing a design, and follow them. Do not introduce a new framework,
datastore, auth mechanism, or deployment approach without flagging it as a deviation.

For the full technology rationale and version requirements, see `standards/tech-stack.md`.

### Step 3 — Map repos and work streams
List every repository this feature will touch. Each repo = one Work Stream in the Convoy.

Any infrastructure resource names in the work stream map must follow `standards/naming-conventions.md`.

Format:
```
Work Stream 1 — [repo name]
  Changes: [what specifically changes]
  Depends on: [other work streams that must complete first, or NONE]

Work Stream 2 — [repo name]
  Changes: [what specifically changes]
  Depends on: [work stream 1, or NONE]
```

Work Streams without dependencies can run in parallel. Mark parallelism explicitly.

### Step 4 — Produce the Decision Impact Statement
This is mandatory for Gate 2. For every significant design decision, document:

| Decision | Confidence | If Wrong, Rework Cost | Risk Level |
|---|---|---|---|
| [e.g., Store X in new table vs. extend existing Y table] | HIGH/MEDIUM/LOW | Stage 3 schema migration | MEDIUM |
| [e.g., Use Drizzle relation vs. raw join] | HIGH | Stage 3 query rewrites | LOW |
| [e.g., Auth scope expansion] | MEDIUM | Stages 3, 5, 8 revisit | HIGH |

Flag any `Risk Level: HIGH` item explicitly in the gate request.

### Step 5 — Log design decisions
Add entries to the Decisions Log in living-spec.md for each major design choice:

| Date | Decision | Rationale | Made By |
|---|---|---|---|
| 2026-04-07 | Use existing `tasks` table + new `time_logs` table | Avoids schema migration risk to tasks | Design Agent |

### Step 6 — Update living-spec.md Work Streams table
Populate the Work Streams section with every repo and its dependency map.

Set stage to `2` in the living-spec.md header.

## Gate 2 Criteria (Pre-Gate Checklist)
Before requesting Gate 2 approval, verify ALL of the following:

- [ ] Solution approach is written in prose (not bullet fragments)
- [ ] All technology constraint deviations are explicitly flagged and justified
- [ ] Every repo that will be touched has a Work Stream entry
- [ ] Work Stream dependencies are specified (or NONE where parallel is safe)
- [ ] Decision Impact Statement is complete with confidence and risk levels
- [ ] All HIGH-risk decisions are called out explicitly in the gate request body
- [ ] No implementation code has been written — this is design only
- [ ] Decisions Log has at least one entry

## Common Failure Modes
- **Skipping CONTEXT.md**: Proposing patterns that already exist differently in the codebase.
- **Missing work streams**: Forgetting that a shared-library or schema change in one repo affects every repo that depends on it.
- **No Decision Impact Statement**: Passing a design that has unacknowledged HIGH-risk decisions.
- **Invisible technology deviations**: Quietly introducing a new dependency without flagging it.

## What to Escalate
- New external dependency or library → escalate to `architect` for approval before Gate 2
- Auth or session model change → escalate to `security` before Gate 2
- Schema migration that cannot be reversed → escalate to `architect`
- Design conflicts between two valid approaches → escalate to `architect` for tie-break
