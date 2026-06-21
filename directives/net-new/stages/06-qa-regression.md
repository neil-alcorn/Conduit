<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/net-new/stages/06-qa-regression.md
# description: Stage 6 QA Regression directive. End-to-end, cross-repo, visual regression.
# owner:       HUMAN
# update:      Manual when QA regression policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **No commit/push** — the Conduit window commits after gate approval.
- **Scope first:** test only flows sharing components, routes, tables, or API contracts with this convoy's changes — not the whole app.
- **Run E2E on in-scope flows, check cross-repo impact, and visual regression** if any `.svelte` files changed. Verdict: CLEAR / REGRESSION FOUND (→ back to Stage 3).
- **Avoid:** testing only the new feature (regression = existing behavior), over-broad scope, skipping cross-repo checks.

# Stage 6 — QA Regression Directive (Net New)

## ⛔ COMMIT AUTHORITY — You are NOT authorized to commit or push

**You are NOT authorized to run `git commit` or `git push` in any repo during this stage.**

Committing before gate approval is a convoy violation. It makes the repo's git history inconsistent with the convoy audit trail. If a gate is rejected, a pre-approval commit requires a revert and creates noise in the history.

The authority chain is:
1. You complete the work and report findings in this session.
2. The human reviews and approves or rejects the gate.
3. **The Conduit window commits and pushes after approval.** Not before.

If you find yourself typing `git commit` or `git push` in this stage, **stop**. You are not authorized. Report your findings as text and wait for the gate decision.

This applies to ALL repos you touch in this stage.

## Recommended Model
**claude-sonnet-4-6** — Regression analysis is systematic comparison work. Does not require Opus-level reasoning. Use Sonnet to analyze results and identify regressions. Human QA lead reviews the analysis.

## What This Stage Produces
1. End-to-end test results for affected user flows
2. Cross-repo impact assessment
3. Visual regression report (if applicable)
4. Regression verdict: CLEAR / REGRESSION FOUND

## Context to Load
- living-spec.md — Acceptance Criteria and Work Streams sections only
- ACCEPTANCE.md — full
- Do NOT load CONTEXT.md

## Step-by-Step Instructions

### Step 1 — Identify regression scope
From the Work Streams and files changed in this Convoy, identify:
- User flows that share components, routes, or DB tables with the changes
- Features that depend on any modified API contracts
- Features that use any modified shared components

Test this scope only, not the entire application.

### Step 2 — Run end-to-end tests for affected flows
For each flow in scope:
- Execute from entry point to completion
- Verify outcome matches its existing acceptance criteria
- Flag any deviation as a regression

### Step 3 — Cross-repo regression check
For each Work Stream in the Convoy, verify changes did not break:
- Any route that the changed API serves (check all callers)
- Any UI component that the changed data feeds
- Any job or webhook that depends on the changed schema

### Step 4 — Visual regression (if UI was changed)
If this Convoy touched any .svelte files:
- Compare key page screenshots against baseline (qa/eyewitness/)
- Flag layout shifts, missing elements, or broken responsive behavior

### Step 5 — Write regression verdict

```
REGRESSION VERDICT: [CLEAR | REGRESSION FOUND]

Flows tested: N
Regressions found: N

Regression details (if any):
- [Flow affected] — [What broke] — Severity: BLOCKER | MAJOR | MINOR
```

REGRESSION FOUND sends the Convoy back to Stage 3 for the affected work stream.

## Gate 6 Criteria (Pre-Gate Checklist)
Before requesting Gate 6 approval, verify ALL of the following:

- [ ] Regression scope documented (what was in scope and why)
- [ ] All in-scope user flows tested
- [ ] Cross-repo impact assessed
- [ ] Visual regression checked if UI was touched
- [ ] Regression verdict written and attached to gate request
- [ ] No BLOCKER regressions unresolved

## Common Failure Modes
- Testing only the new feature: regression tests existing behavior, not new behavior
- Scope too broad: testing the entire app when 2 routes changed wastes time
- Skipping cross-repo: a schema or shared-library change in one repo breaks a dependent repo silently

## What to Escalate
- Regression in a feature owned by another team → escalate to that feature owner first
- Regression in a shared component used by many features → escalate to architect
