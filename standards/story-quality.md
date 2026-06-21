<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/story-quality.md
# description: Story quality rules for work items. Derived from a work-item linter (credit: external contributor).
# owner:       HUMAN
# update:      Manual when lint rules change or new rules are added.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Pre-Gate 1 checklist for every User Story:** StoryPoints + Clarity + Complexity set (REQUIRED_FIELD); points in {1,2,3,5,8,13} only (INVALID_POINTS); 13 points = split it.
- **Estimate as "Jay Dev":** a competent mid-level dev unfamiliar with this codebase — 2 ≈ 1 hour, 5 ≈ a full day.
- **Clarity=3 requires an "Open Questions"/"Unknowns" section** (error); Complexity=3 should have a "Testing"/"Validation" section (warn); ACs in Given/When/Then by Gate 3.
- **Never write to the work tracker without an intermediate review step** — lint/plan → human review → approve → apply (the linter pattern).

# Story Quality Standards

These rules define what a well-formed User Story looks like in your work tracker. They are applied as a pre-Gate 1 checklist by any agent writing or reviewing stories, and will be enforced automatically by the Conduit CLI in Phase 1.1.

**Origin:** These rules are derived from an open-source work-item linter (by an external contributor). The Conduit CLI implementation in Phase 1.1 should treat that linter's rule engine as the reference implementation. Its stage-locally → review → approve → apply pattern is the model for Conduit's pre-gate evaluation flow.

---

## The "Jay Dev" Estimation Standard

All story point estimates assume **Jay Dev**: a competent mid-level developer, unfamiliar with this specific codebase, working methodically and without heroics.

Jay Dev does not pair-program by default, does not skip tests, and does not make assumptions about undocumented behavior. If an estimate requires expertise that Jay Dev does not have, the story needs a prerequisite discovery story first.

| Points | Meaning |
|---|---|
| 1 | Trivial — finding the right file takes longer than the change |
| 2 | About one hour of focused work |
| 3 | About half a day |
| 5 | A solid full day |
| 8 | A few days — complex but bounded |
| 13 | Should be split — approximately 2 weeks, too uncertain to estimate well |

**Only `1, 2, 3, 5, 8, 13` are valid.** Any other value is a lint error.

---

## Lint Rules (applied before Gate 1)

These rules run against every User Story before a gate can be approved. Errors are gate blockers. Warnings must be acknowledged.

### REQUIRED_FIELD — error

Every User Story must have values set for:
- `StoryPoints` — estimation in Jay Dev points
- `Clarity` — how well-understood the work is (1=Clear, 2=Mostly Clear, 3=Ambiguous)
- `Complexity` — technical difficulty (1=Simple, 2=Moderate, 3=Complex)

A story with any of these missing is not ready for development.

### MISSING_AC — warn

Every User Story should have Acceptance Criteria in Given/When/Then format. Stories without AC can be approved at Gate 1 but must have AC added before Gate 3 (Implementation start).

### INVALID_POINTS — error

Story points must be in {1, 2, 3, 5, 8, 13}. Any other value indicates an estimate that wasn't made with the Jay Dev scale in mind.

### OVERSIZE_POINTS — warn

Story points = 13 means the story should be split. A 13-point story is too uncertain and too large for a single PR review cycle. Split it before Gate 3.

### AMBIGUOUS_MISSING_UNKNOWNS — error

If Clarity = 3 (Ambiguous), the story description must contain a section titled one of: "Open Questions", "Unknowns", or "Assumptions". Ambiguous stories without documented unknowns are a planning failure — the ambiguity is hidden, not managed.

### COMPLEX_MISSING_TESTING — warn

If Complexity = 3 (Complex), the story description should contain a section titled "Testing" or "Validation". Complex stories without a testing approach noted will likely cause scope creep at Stage 4.

---

## Pre-Gate 1 Checklist (for agents writing stories)

Before any gate 1 approval, verify every User Story in the convoy:

- [ ] StoryPoints set and in {1,2,3,5,8,13}
- [ ] Clarity set (1/2/3)
- [ ] Complexity set (1/2/3)
- [ ] If Clarity=3: "Open Questions" or "Unknowns" section in description
- [ ] If Complexity=3: "Testing" or "Validation" section in description
- [ ] Acceptance Criteria present (or documented plan to add before Gate 3)
- [ ] No story points = 13 without a documented split plan

---

## Stage-Locally → Review → Apply Pattern

When Conduit CLI generates or modifies work-item stories (Phase 1.1+), it follows this linter pattern:

1. **Lint/Plan** — fetch stories, run rules, generate suggestions, save to `.story_suggest/[run].json`
2. **Review** — human reads suggestions; nothing has been written to the tracker yet
3. **Approve/Reject** — human marks each suggestion; still no writes
4. **Apply** — only approved suggestions are written to the tracker

This is not optional. Conduit must never write to the work tracker without an intermediate review step.

---

## Phase 1.1 Implementation Notes

When building Phase 1.1 (Gate evaluation logic), the Conduit CLI should:

1. Study the reference linter's rule implementations for each rule
2. Port rules to TypeScript in `conduit/cli/src/commands/lint/rules/`
3. Use the same rule IDs (REQUIRED_FIELD, MISSING_AC, INVALID_POINTS, etc.)
4. Reuse the reference linter's tracker-client patterns for work-tracker API calls
5. Credit the external contributor (the linter's author) in the ADR and in the CLI `--version` output

The suggestion artifact format (`.story_suggest/[run].json`) should be adopted as-is or with minor modifications.
