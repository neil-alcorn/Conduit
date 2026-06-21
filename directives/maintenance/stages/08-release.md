<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/maintenance/stages/08-release.md
# description: Stage 8 Release directive delta for maintenance convoys.
# owner:       HUMAN
# update:      Manual when release policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 8. No commit/push. Smoke test is stability-focused:** healthy startup, auth works; DEPENDENCY_UPDATE also verifies the primary flow per affected area; INFRA verifies deploy completed and environment is reachable.
- **CONTEXT.md updates by type:** version references (DEPENDENCY_UPDATE), Deployment Notes (INFRA), architecture description only if changed (PERFORMANCE/TECH_DEBT).
- Process event must include `work_type: maintenance` AND `maintenance_type`.

# Stage 8 — Release Directive (Maintenance)

## ⛔ COMMIT DISCIPLINE

**Do NOT commit or push.** Execute the checklist, report results, wait for Gate 8 approval. The Conduit window commits after approval.

> **Delta from net-new**: See `directives/net-new/stages/08-release.md` for the full base directive.
> This file documents only what DIFFERS for maintenance convoys.

## Recommended Model
**claude-haiku-4-5** — Same as net-new.

## Key Difference: Smoke Test Is Stability-Focused

Maintenance smoke tests verify that nothing broke, not that something new works. The test is pass/fail on core stability.

Post-deployment smoke test for maintenance:
1. Confirm application starts and reaches healthy state (no startup errors in App Service logs)
2. Confirm auth still works (login → dashboard load)
3. For DEPENDENCY_UPDATE: confirm the primary user flow for each affected area works end-to-end
4. For INFRA: confirm the deployment completed and the environment is reachable

## CONTEXT.md Update for Maintenance

For DEPENDENCY_UPDATE: update any version references in CONTEXT.md (e.g., "Node 20" → "Node 22").
For INFRA: update the Deployment Notes section with any new configuration requirements.
For PERFORMANCE / TECH_DEBT: update CONTEXT.md only if the refactor changes the architecture description.

## Process Event for Maintenance

```json
{"ts":"[ISO]","event":"convoy.closed","convoy_id":"epic-NNNNN","work_type":"maintenance","maintenance_type":"[DEPENDENCY_UPDATE|PERFORMANCE|TECH_DEBT|INFRA]","rework_count":0}
```

## Gate 8 Addition (in addition to net-new checklist)

- [ ] Application startup confirmed healthy in production
- [ ] Core auth flow confirmed working post-deployment
- [ ] Process event includes `work_type: maintenance` and `maintenance_type`
