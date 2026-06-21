<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/maintenance/stages/00-intake.md
# description: Stage 0 Intake directive delta for maintenance convoys.
# owner:       HUMAN
# update:      Manual when intake policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 0. Classify `maintenance_type` first** (DEPENDENCY_UPDATE / PERFORMANCE / TECH_DEBT / INFRA) in convoy.yaml — it sets Stage 5 review depth. New functionality → enhancement; broken behavior → bug-fix.
- **Document the Maintenance Scope** in living-spec.md: what changes, what stays the same, risk level, rollback plan (written before Stage 3 begins).
- Active stages: 00, 03, 04, 05, 08 — Stages 1, 2, 6, 7 are skipped. Convoys live in the central conduit repo only.

# Stage 0 — Intake Directive (Maintenance)

> **Delta from net-new**: See `directives/net-new/stages/00-intake.md` for the full base directive.
> This file documents only what DIFFERS for maintenance convoys.

## Convoy storage — central only (CLI-4 / AC-24)

Convoys live in the central conduit repo, never in target repos. `conduit convoy new`
captures the target repo's identity in `convoy.yaml` `metadata.target_repo` /
`metadata.target_repo_path` so source-code commits land in the right place.
See `directives/shared/convoy-agent-behavior.md` §0 for the full resolution rule.

## Recommended Model
**claude-haiku-4-5** — Classification and structured form completion. Same as net-new.

## Key Difference: Classify the Maintenance Type

Every maintenance convoy must begin by classifying which type of maintenance this is. The type determines what Stage 5 security review depth is required.

```
Maintenance Type: [select one]
  DEPENDENCY_UPDATE — upgrading or replacing a package/library/runtime
  PERFORMANCE       — optimizing speed, memory, or throughput without changing behavior
  TECH_DEBT         — restructuring code without changing external behavior
  INFRA             — infrastructure, deployment, environment, or pipeline changes
```

Set `maintenance_type` in convoy.yaml alongside `work_type: maintenance`.

Classification guidance:
- If the work adds new functionality to the codebase, even "small" new features → reclassify as enhancement
- If the work fixes broken behavior → reclassify as bug-fix
- If unsure between TECH_DEBT and PERFORMANCE: ask "does this change observable behavior?" — if no, it is TECH_DEBT

## Maintenance Stages Active: 00, 03, 04, 05, 08

Stages 01, 02, 06, 07 are skipped. The work scope and approach are documented here at Stage 0.

Maintenance scope (add to living-spec.md):
```
### Maintenance Scope
Type: [DEPENDENCY_UPDATE | PERFORMANCE | TECH_DEBT | INFRA]
What changes: [Specific packages, files, or components being updated]
What stays the same: [User-visible behavior that must not change]
Risk level: [LOW | MEDIUM | HIGH — justify]
Rollback plan: [How to revert if something goes wrong]
```

## Gate 0 Additions (in addition to net-new checklist)

- [ ] `maintenance_type` is set in convoy.yaml
- [ ] Maintenance scope is documented with what changes and what stays the same
- [ ] Rollback plan is written before Stage 3 begins
- [ ] Work has not been reclassified away from maintenance without updating work_type
