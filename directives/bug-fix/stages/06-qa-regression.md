<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/bug-fix/stages/06-qa-regression.md
# description: Stage 6 QA Regression directive delta for bug-fix convoys.
# owner:       HUMAN
# update:      Manual when QA regression policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 6. Deliberately NARROW scope:** the affected flow end-to-end, direct callers of the changed code, and anything sharing the changed data path — do NOT run a broad regression sweep.
- **Document the scope explicitly** (affected flow, callers tested, shared-path callers, deliberate exclusions with reasons). Gate 6 criteria unchanged from net-new.

# Stage 6 — QA Regression Directive (Bug Fix)

> **Delta from net-new**: See `directives/net-new/stages/06-qa-regression.md` for the full base directive.
> This file documents only what DIFFERS for bug-fix convoys.

## Recommended Model
**claude-sonnet-4-6** — Same as net-new.

## Key Difference: Narrowly Scoped Regression

Bug-fix regression scope is deliberately narrow: **the affected behavior and its direct callers**.

Do NOT run a broad regression sweep for a bug fix. Narrow scope prevents wasted time and forces clarity about what the fix actually touches.

Regression scope for a bug fix:
1. The exact user flow where the bug occurred (confirm it is fixed end-to-end)
2. Direct callers of the changed function/route/component (confirm they still behave correctly)
3. Any behavior that shares the changed data path (DB table, shared utility, etc.)

Document scope explicitly:
```
Regression Scope:
- Affected flow: [name of the flow where bug occurred]
- Direct callers tested: [list]
- Shared data path callers tested: [list or NONE]
- Excluded from scope: [anything deliberately excluded and why]
```

## Gate 6 — No Changes

Same as net-new. The base directive is the full requirement for this stage.
