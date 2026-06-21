<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/enhancement/stages/05-qa-security.md
# description: Stage 5 QA Security directive delta for enhancement convoys.
# owner:       HUMAN
# update:      Manual when security policy changes. Quarterly review required.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 5. MANDATORY; Opus required — never downgrade the security stage.**
- **Lens: did the enhancement change the existing security posture?** Answer the 4 pre-review questions (new inputs? auth changes? changed response data? new/changed writes?) — any "yes" expands OWASP scope.
- All four "no" → document that explicitly and run a reduced-scope review (minimum A01, A03, A07). Gate 5 criteria are unchanged from net-new.

# Stage 5 — QA Security Directive (Enhancement)

## ⚠ MANDATORY STAGE — Cannot be skipped for any work type that modifies code.

> **Delta from net-new**: See `directives/net-new/stages/05-qa-security.md` for the full base directive.
> This file documents only what DIFFERS for enhancement convoys.

## Recommended Model
**claude-opus-4-6** — REQUIRED. NEVER downgrade security stage. Same as net-new.

## Key Difference: Focus on Whether Enhancement Changes Security Surface

For enhancements, the security review has a specific lens: **did the enhancement change the security posture of what already existed?**

Before the OWASP checklist, answer these questions explicitly:

```
Pre-Review Questions:
1. Did this enhancement add new data inputs or API parameters? → Yes/No
2. Did this enhancement change existing auth or permission checks? → Yes/No
3. Did this enhancement change what data is returned from existing endpoints? → Yes/No
4. Did this enhancement add new database writes or update existing write paths? → Yes/No
```

Any "Yes" answer expands the OWASP scope. A "No" to all four means the existing security posture is likely unchanged — document that explicitly and complete a reduced-scope review (at minimum A01, A03, A07).

## Gate 5 — No Changes

Same as net-new. No additions. The base directive is the full requirement for this stage.
