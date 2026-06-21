<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/maintenance/stages/05-qa-security.md
# description: Stage 5 QA Security directive delta for maintenance convoys.
# owner:       HUMAN
# update:      Manual when security policy changes. Quarterly review required.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 5. MANDATORY; Opus required — never downgrade.**
- **DEPENDENCY_UPDATE: run the CVE delta check** (`npm audit` before and after) — an upgrade introducing new HIGH/CRITICAL CVEs is a gate blocker; justify or revert.
- PERFORMANCE/TECH_DEBT/INFRA: OWASP review focused on the changed surface, noting the maintenance type in the verdict — but TECH_DEBT touching auth, validation, or data access requires a FULL OWASP review. Gate 5 criteria unchanged from net-new.

# Stage 5 — QA Security Directive (Maintenance)

## ⚠ MANDATORY STAGE — Cannot be skipped for any work type that modifies code.

> **Delta from net-new**: See `directives/net-new/stages/05-qa-security.md` for the full base directive.
> This file documents only what DIFFERS for maintenance convoys.

## Recommended Model
**claude-opus-4-6** — REQUIRED. NEVER downgrade security stage. Same as net-new.

## Key Difference: CVE Delta Check for Dependency Updates

For DEPENDENCY_UPDATE maintenance, the security review has a specific additional requirement: **check the CVE delta between the old and new versions.**

```
CVE Delta Check:
Package: [package name]
Old version: [x.y.z]
New version: [x.y.z]

CVEs fixed by this upgrade:
- [CVE-YYYY-NNNNN]: [severity] — [description]

CVEs introduced by this upgrade (new in new version, not in old):
- [CVE-YYYY-NNNNN]: [severity] — [description]
- NONE (if no new CVEs)

Net CVE delta: [positive = improved / negative = worsened / neutral]
```

Run `npm audit` before and after the upgrade to capture this delta. A dependency update that introduces new HIGH or CRITICAL CVEs is a gate blocker — the upgrade must be justified or reverted.

## For Non-Dependency Maintenance Types

For PERFORMANCE, TECH_DEBT, and INFRA:
- Complete the base directive OWASP review focused on the changed surface
- Note the maintenance type at the top of the security verdict: "Maintenance type: [TYPE] — security review scope adjusted accordingly"
- TECH_DEBT refactors that touch auth, validation, or data access paths require a full OWASP review regardless

## Gate 5 — No Changes

Same as net-new. The base directive is the full requirement for this stage.
