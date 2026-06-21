<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/enhancement/stages/08-release.md
# description: Stage 8 Release directive delta for enhancement convoys.
# owner:       HUMAN
# update:      Manual when release policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 8. No commit/push** — checklist execution, then wait for Gate 8.
- **Smoke test must also verify at least one PRESERVE criterion in production** — if existing behavior broke, treat as regression: do not close the convoy, open a bug-fix convoy immediately.
- Gate 8 additions: preserve criterion verified, process event `work_type: enhancement`; the net-new close checklist applies identically.

# Stage 8 — Release Directive (Enhancement)

## ⛔ COMMIT DISCIPLINE

**Do NOT commit or push.** Execute the checklist, report results, wait for Gate 8 approval. The Conduit window commits after approval.

> **Delta from net-new**: See `directives/net-new/stages/08-release.md` for the full base directive.
> This file documents only what DIFFERS for enhancement convoys.

## Recommended Model
**claude-haiku-4-5** — Same as net-new.

## Key Difference: Smoke Test Must Cover Preserved Behaviors

The net-new smoke test verifies the primary acceptance criterion. For enhancements, the smoke test must additionally verify at least one preserve criterion — confirming the existing behavior still works after deployment.

Post-deployment smoke test for enhancements:
1. Execute the primary new/changed acceptance criterion manually (same as net-new)
2. Execute at least one preserve criterion manually — confirm it still works
3. Confirm auth still works (same as net-new)

If step 2 fails in production: treat as a regression, do not close the Convoy. Open a bug-fix Convoy immediately.

## Gate 8 Addition (in addition to net-new checklist)

- [ ] At least one preserve criterion verified in production smoke test
- [ ] process event `work_type` field set to `enhancement`

> The Gate 8 close checklist (Steps 6–9) from the net-new directive applies here identically — gate_history, events, work-tracker updates, archive, commit, push, current-state.md update. The implementation agent reports; the Conduit window closes.
