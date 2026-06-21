<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/net-new/stages/05-qa-security.md
# description: Stage 5 QA Security directive. MANDATORY. OWASP, deps, SAST, escalation.
# owner:       HUMAN
# update:      Manual when security policy changes. Quarterly review required.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **MANDATORY for any code change; use Opus.** No commit/push — report findings and wait for the gate.
- **Run SAST + `npm audit`** (HIGH/CRITICAL = BLOCKER), complete the OWASP Top 10 checklist for new code surfaces, and review every new route's auth boundary.
- **Verdict: CLEAR / CONDITIONAL CLEAR / BLOCKED** — BLOCKED returns to Stage 3; no gate request with unresolved BLOCKERs. Escalate CRITICAL or PII findings immediately.
- **Avoid:** treating `npm audit` as the whole review, dismissing OWASP items untested, unauthenticated routes serving protected data.

# Stage 5 — QA Security Directive (Net New)

## ⛔ COMMIT AUTHORITY — You are NOT authorized to commit or push

**You are NOT authorized to run `git commit` or `git push` in any repo during this stage.**

Committing before gate approval is a convoy violation. It makes the repo's git history inconsistent with the convoy audit trail. If a gate is rejected, a pre-approval commit requires a revert and creates noise in the history.

The authority chain is:
1. You complete the work and report findings in this session.
2. The human reviews and approves or rejects the gate.
3. **The Conduit window commits and pushes after approval.** Not before.

If you find yourself typing `git commit` or `git push` in this stage, **stop**. You are not authorized. Report your findings as text and wait for the gate decision.

This applies to ALL repos you touch in this stage.

**Exception:** If the agent is working in a non-convoy context (exploratory work, hotfix outside any active convoy), this rule does not apply.

## ⚠ MANDATORY STAGE — Cannot be skipped for any work type that modifies code.

## Recommended Model
**claude-opus-4-6** — REQUIRED for this stage. Security analysis requires deep reasoning about attack surfaces, vulnerability chains, and OWASP coverage. Do not use Sonnet or Haiku for Stage 5. A missed vulnerability that reaches production costs more than the token difference.

## What This Stage Produces
1. SAST scan results summary (static analysis)
2. Dependency vulnerability report
3. OWASP Top 10 manual review checklist (completed)
4. Security verdict: CLEAR / CONDITIONAL CLEAR / BLOCKED
5. If BLOCKED: specific findings with remediation requirements

## Context to Load
- `living-spec.md` — full (need intent, design, and what was actually built)
- `CONDUIT.md` — full (need auth model and security contacts)
- `CONTEXT.md` — Auth and Authorization section + Data Flow Summary only

## Step-by-Step Instructions

### Step 1 — Run SAST analysis
```bash
npm audit
npm run lint:security  # if configured
```

For the diff introduced in this Convoy, review for:
- Hardcoded secrets, tokens, or credentials
- SQL injection vulnerabilities (raw query construction)
- Command injection (unsanitized user input in shell calls)
- Path traversal vulnerabilities

Record all findings with severity (HIGH / MEDIUM / LOW / INFORMATIONAL).

### Step 2 — Run dependency vulnerability scan
```bash
npm audit --audit-level=moderate
```

Review every vulnerability finding:
- HIGH or CRITICAL: BLOCKER — must resolve before Gate 5
- MODERATE: document and assess — escalate if in a code path touched by this Convoy
- LOW: document only

Check for outdated dependencies added by this Convoy using `npm outdated`.

### Step 3 — OWASP Top 10 Review
For every new API route and data input point introduced in this Convoy, complete this checklist:

| # | Risk | Applies to this Convoy? | Finding | Severity |
|---|---|---|---|---|
| A01 | Broken Access Control | Yes/No | [finding or CLEAR] | |
| A02 | Cryptographic Failures | Yes/No | [finding or CLEAR] | |
| A03 | Injection (SQL, Command, LDAP) | Yes/No | [finding or CLEAR] | |
| A04 | Insecure Design | Yes/No | [finding or CLEAR] | |
| A05 | Security Misconfiguration | Yes/No | [finding or CLEAR] | |
| A06 | Vulnerable/Outdated Components | Yes/No | [finding or CLEAR] | |
| A07 | Identification/Authentication Failures | Yes/No | [finding or CLEAR] | |
| A08 | Software/Data Integrity Failures | Yes/No | [finding or CLEAR] | |
| A09 | Security Logging/Monitoring Failures | Yes/No | [finding or CLEAR] | |
| A10 | Server-Side Request Forgery | Yes/No | [finding or CLEAR] | |

Mark "Does Not Apply" only when the Convoy introduces no code in that category. When in doubt, mark Yes and investigate.

### Step 4 — Auth and data boundary review
Review every new route against the repo's auth model:
- Is the route behind the app's server-side auth check?
- Does the route enforce role-based access for the roles the app defines?
- Does the route expose data that should be user-scoped but queries without filtering?
- Is any token or credential written to logs, query strings, or error messages?

Any YES to the last two is a BLOCKER.

### Step 5 — Write the security verdict

```
SECURITY VERDICT: [CLEAR | CONDITIONAL CLEAR | BLOCKED]

SAST findings: N HIGH, N MEDIUM, N LOW
Dependency findings: N HIGH/CRITICAL, N MODERATE
OWASP coverage: N/10 categories reviewed, N findings

BLOCKERS (must resolve before Gate 5):
- [Finding] — [Remediation required]

CONDITIONS (must resolve before release):
- [Finding] — [What must be done]
```

**CLEAR**: No HIGH or CRITICAL findings. All OWASP items reviewed.
**CONDITIONAL CLEAR**: MODERATE findings documented with accepted risk or remediation plan.
**BLOCKED**: Any HIGH or CRITICAL finding. Work returns to Stage 3 for remediation.

## Gate 5 Criteria (Pre-Gate Checklist)
Before requesting Gate 5 approval, verify ALL of the following.

Items prefixed with `**<check-id>**:` are auto-executable by `conduit pre-gate` (CLI-2);
the rest remain manual review items per AC-9 backward-compat.

- [ ] SAST scan completed and results documented
- [ ] **audit-summary**: `npm audit` run — no HIGH or CRITICAL unresolved (auto-deduped via `conduit audit-summary`)
- [ ] OWASP Top 10 checklist completed for all new code surfaces
- [ ] Auth boundary review completed — no unauthenticated routes serving protected data
- [ ] No secrets or tokens in code, logs, or query parameters
- [ ] Security verdict written and attached to gate request
- [ ] All BLOCKERS resolved (BLOCKED verdict = cannot request gate)

## Common Failure Modes
- **Scope narrowing**: "This route doesn't handle external data" — review all routes regardless.
- **Treating npm audit as complete security review**: It only covers known CVEs in dependencies. It does not check your code.
- **Skipping OWASP items that "don't apply"**: Apply the test before deciding it doesn't apply.
- **Missing the auth boundary**: New routes that don't check the authenticated user serve data to anyone.

## What to Escalate
- Any CRITICAL finding → escalate to `security` immediately, do not wait for gate
- PII exposure finding → escalate to `security` and `compliance`
- Dependency with HIGH CVE that cannot be updated without breaking changes → escalate to `architect`
- Auth model confusion (unclear what roles should access what) → escalate to `architect`
