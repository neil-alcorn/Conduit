<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/bug-fix/stages/00-intake.md
# description: Stage 0 Intake directive delta for bug-fix convoys.
# owner:       HUMAN
# update:      Manual when intake policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 0. No fix begins without root cause analysis** — document Bug Report (repro steps, frequency) + Root Cause Hypothesis in living-spec.md; if no hypothesis is possible, plan a Stage 3 spike explicitly.
- **Stage 0 absorbs Stages 1–2 for bug fixes** — also document the Fix Approach (minimal/surgical scope, rollback plan) here.
- Gate 0 blocks on: hypothesis or spike documented, bug reproducible (or intermittent conditions noted), no refactoring scope unless the refactor IS the fix.

# Stage 0 — Intake Directive (Bug Fix)

> **Delta from net-new**: See `directives/net-new/stages/00-intake.md` for the full base directive.
> This file documents only what DIFFERS for bug-fix convoys.

## Convoy storage — central only (CLI-4 / AC-24)

Convoys live in the central conduit repo, never in target repos. `conduit convoy new`
captures the target repo's identity in `convoy.yaml` `metadata.target_repo` /
`metadata.target_repo_path` so source-code commits land in the right place.
See `directives/shared/convoy-agent-behavior.md` §0 for the full resolution rule.

## Recommended Model
**claude-sonnet-4-6** — Intake classification is a judgment task requiring business context understanding, not simple pattern matching. Haiku is insufficient for scope classification and risk assessment.

## Key Difference: Root Cause Analysis Required

**No fix begins without understanding the cause.** This is not optional. A bug fixed without root cause analysis has a high probability of:
- Being fixed incorrectly (masking vs. resolving)
- Recurring in a neighboring code path
- Introducing a new bug in the patch

At Stage 0, document the following in the living-spec.md Intent:

```
### Bug Report
Reported behavior: [What the user/system observed]
Expected behavior: [What should have happened]
Repro steps: [Exact steps to reproduce]
Frequency: [Always / Intermittent — if intermittent, under what conditions?]
First observed: [Date or commit, if known]

### Root Cause Hypothesis
Suspected cause: [Your hypothesis about why this is happening]
Evidence: [What in the code or logs supports this hypothesis]
Confirmed: [Yes — reproduced / No — hypothesis only]
```

If you cannot form a root cause hypothesis at intake: document that explicitly. The convoy may need a spike at Stage 3 to investigate before fixing.

## Stage 0 Absorbs Stage 2 Content for Bug Fixes

Bug-fix convoys skip Stage 1 (BA Requirements) and Stage 2 (Solution Design). The root cause analysis and fix approach belong here at Stage 0, not in a separate design stage.

Fix approach (add to living-spec.md):
```
### Fix Approach
Proposed fix: [What will change and why]
Minimal scope: [Confirm this is surgical — no refactoring unless refactor IS the fix]
Rollback: [Can this be reverted without data loss?]
```

## Gate 0 Additions (in addition to net-new checklist)

- [ ] Root cause hypothesis is documented (or spike is explicitly planned)
- [ ] Bug is reproducible (steps documented) OR intermittent with conditions documented
- [ ] Fix approach is documented and confirmed as minimal/surgical
- [ ] No refactoring scope has been added unless the refactor is the fix
