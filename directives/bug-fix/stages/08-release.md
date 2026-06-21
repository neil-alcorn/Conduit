<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/bug-fix/stages/08-release.md
# description: Stage 8 Release directive delta for bug-fix convoys.
# owner:       HUMAN
# update:      Manual when release policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 8. No commit/push.** Smoke test = reproduce the original bug steps in production and confirm the bug is gone, plus auth and the Stage 6 adjacent flows.
- **If the bug still occurs in production:** do not close the convoy — investigate deployment state before assuming the fix didn't ship.
- Process event must carry `work_type: bug-fix` (+ root cause category if known).

# Stage 8 — Release Directive (Bug Fix)

## ⛔ COMMIT DISCIPLINE

**Do NOT commit or push.** Execute the checklist, report results, wait for Gate 8 approval. The Conduit window commits after approval.

> **Delta from net-new**: See `directives/net-new/stages/08-release.md` for the full base directive.
> This file documents only what DIFFERS for bug-fix convoys.

## Recommended Model
**claude-haiku-4-5** — Same as net-new.

## Key Difference: Smoke Test Verifies the Fixed Behavior

The net-new smoke test verifies the new capability. For bug fixes, the smoke test must verify that the specific bug behavior is resolved in production.

Post-deployment smoke test for bug fixes:
1. Reproduce the original bug steps in production — confirm the bug no longer occurs
2. Confirm auth still works (same as net-new)
3. Confirm the adjacent flows from Stage 6 regression scope are still working

If step 1 shows the bug still occurs in production: do not close the Convoy. Investigate deployment state before assuming the fix did not ship.

## Process Event for Bug Fixes

The process event `work_type` field must be set to `bug-fix`. Include the root cause category if known:

```json
{"ts":"[ISO]","event":"convoy.closed","convoy_id":"epic-NNNNN","work_type":"bug-fix","root_cause":"[auth|validation|data|logic|infra]","rework_count":0}
```

## Gate 8 Addition (in addition to net-new checklist)

- [ ] Bug behavior confirmed resolved in production smoke test (not just in tests)
- [ ] Process event includes `work_type: bug-fix`
