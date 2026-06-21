<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/enhancement/stages/01-ba-requirements.md
# description: Stage 1 BA Requirements directive delta for enhancement convoys.
# owner:       HUMAN
# update:      Manual when requirements policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 1.** A "Current Behavior" section in living-spec.md is mandatory — it is the baseline that must not regress.
- **Write criteria in two categories:** preserve criteria (existing behavior unchanged) and change criteria (new/modified behavior). Both are required — no preserve criteria means Stage 6 regression will fail.
- Gate 1 needs at least one preserve criterion per affected user flow, plus the same compliance screening as net-new.

# Stage 1 — BA Requirements Directive (Enhancement)

> **Delta from net-new**: See `directives/net-new/stages/01-ba-requirements.md` for the full base directive.
> This file documents only what DIFFERS for enhancement convoys.

## Recommended Model
**claude-sonnet-4-6** — Same as net-new.

## Key Difference: Current Behavior Section Required

The living-spec.md Requirements section for an enhancement MUST include a **Current Behavior** section before specifying what changes. This is not optional.

```
### Current Behavior
- Given [existing user state], when [existing user action], the system currently [existing response]
- [List each behavior that exists today — these are the baseline that must not regress]

### New / Changed Behavior
- Given [user state], when [user action], then [new or changed response]
```

The purpose: without documenting current behavior, it is impossible to know what the acceptance criteria for "did not break" look like at Stage 6.

## Requirement Framing for Enhancements

When writing acceptance criteria for enhancements, use two categories:

**Preserve criteria** (what must still work):
```
Given [existing user flow], when [existing action], then [existing outcome — unchanged]
```

**Change criteria** (what is new or modified):
```
Given [user state], when [new or modified action], then [new or modified outcome]
```

Both categories are required. Enhancement convoys without preserve criteria will fail Stage 6 regression.

## Gate 1 Addition (in addition to net-new checklist)

- [ ] Compliance screening completed (same four questions as net-new — see `directives/net-new/stages/01-ba-requirements.md`)
- [ ] "Current Behavior" section is populated with at least one preserve criterion per affected user flow
