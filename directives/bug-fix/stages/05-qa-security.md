<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/bug-fix/stages/05-qa-security.md
# description: Stage 5 QA Security directive delta for bug-fix convoys.
# owner:       HUMAN
# update:      Manual when security policy changes. Quarterly review required.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 5. MANDATORY; Opus required — never downgrade.**
- **Answer the 5-question Fix Security Assessment first** (validation, error handling, auth, data access, was-the-bug-itself-a-vuln?). If the bug WAS a security vulnerability: full OWASP review + escalate to `security` before Gate 5.
- All five "no" → reduced-scope OWASP review is acceptable; document "reduced scope — fix does not change security surface" explicitly. Gate 5 criteria unchanged from net-new.

# Stage 5 — QA Security Directive (Bug Fix)

## ⚠ MANDATORY STAGE — Cannot be skipped for any work type that modifies code.

> **Delta from net-new**: See `directives/net-new/stages/05-qa-security.md` for the full base directive.
> This file documents only what DIFFERS for bug-fix convoys.

## Recommended Model
**claude-opus-4-6** — REQUIRED. NEVER downgrade security stage. Same as net-new.

## Key Difference: Focus on New Security Surface Introduced by the Fix

Bug fixes sometimes introduce security risk by changing validation logic, error handling, or data access patterns. The security review for a bug fix must answer:

**Does the fix introduce new security surface, or does it reduce existing surface?**

Answer these questions before the OWASP checklist:

```
Fix Security Assessment:
1. Does the fix change input validation or sanitization logic? → Yes/No
2. Does the fix change how errors are handled or what is returned on failure? → Yes/No
3. Does the fix change auth checks, permission logic, or role gates? → Yes/No
4. Does the fix change what data is written to or read from the database? → Yes/No
5. Was the original bug itself a security vulnerability (not just a functional defect)? → Yes/No
```

If question 5 is Yes: treat this as a security-first fix. Complete the full OWASP review. Escalate to `security` before Gate 5.

If all five are No: a reduced-scope OWASP review is acceptable. Document "reduced scope — fix does not change security surface" explicitly.

## Gate 5 — No Changes

Same as net-new. The base directive is the full requirement for this stage.
