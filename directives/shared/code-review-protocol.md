<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/code-review-protocol.md
# description: Multi-agent code review with confidence scoring and standards compliance.
# owner:       HUMAN
# update:      Manual — approved changes only.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Applies before any Stage 3+ gate request, on `conduit review`, or before a convoy PR.**
- **Launch 3–4 parallel review agents:** bugs/logic, security/injection, standards compliance (target repo CLAUDE.md overrides general standards), test coverage.
- **Score every finding 0–100 and show ALL of them** — no confidence filter. Cite the relevant standard where one exists.
- **FAIL = any critical/high finding** — resolve before requesting the gate. No rubber-stamp PASS on non-trivial changes.
- **Receiving feedback:** verify technically before implementing; disagree with evidence when the finding is wrong — no performative agreement.

# Code Review Protocol

## Purpose

Multi-agent code review that produces actionable findings with confidence
scores and standards references. The goal is to catch real issues — not to
generate volume.

---

## When This Directive Applies

- Before any gate request at Stage 3+
- When `conduit review` is invoked
- Before opening a PR for convoy work

---

## Review Agents

Launch 3–4 parallel agents (via your host's parallel-agent primitive — see
`parallel-dispatch.md`), each focused on a single dimension:

| Agent | Focus | What It Checks |
|---|---|---|
| **Bugs/Logic** | Correctness | Off-by-one, null paths, race conditions, logic inversions, edge cases |
| **Security/Injection** | Safety | Input validation, injection vectors, secrets in code, unsafe patterns |
| **Standards Compliance** | Consistency | Naming conventions, file structure, patterns from `standards/` and target repo CLAUDE.md |
| **Test Coverage** | Verification | Missing test cases, untested branches, weak assertions, test quality |

Each agent receives:
- The diff or file set under review
- The relevant standards from `standards/`
- The target repo's CLAUDE.md (if it exists)
- The acceptance criteria from the convoy's `living-spec.md`

---

## Confidence Scoring

Every finding gets a confidence score from 0–100:

| Range | Meaning |
|---|---|
| 90–100 | Certain — clear violation, reproducible |
| 80–89 | High confidence — likely issue, evidence strong |
| 60–79 | Medium — possible issue, needs human judgment |
| 0–59 | Low — speculative, pattern-matching without context |

**No filter threshold.** All findings are shown regardless of confidence score.
Low-confidence findings provide valuable signal for human reviewers to assess.
Suppressing them risks hiding real issues that the agent was uncertain about.

If an agent is unsure, it should say so and score accordingly — confidence
scores inform human judgment, they do not gate visibility.

---

## Standards Cross-Reference

Every finding that relates to a documented standard MUST reference it:

```
Finding: Function `parseInput` does not validate string length before processing
Confidence: 92
Standard: standards/security/input-validation.md §3.2
```

Findings that reference no standard are still valid (novel bugs exist), but
standards-backed findings carry more weight in gate evaluation.

---

## CLAUDE.md Compliance

The target repository's CLAUDE.md contains repo-specific rules that override
general standards. The Standards Compliance agent must:

1. Read the target repo's CLAUDE.md before reviewing
2. Flag any violation of repo-specific rules
3. If a general standard conflicts with the repo's CLAUDE.md, the CLAUDE.md wins

---

## Output Format

The combined review follows the `CodeReview` type from conduit-core:

```
CODE REVIEW REPORT
==================
Convoy:     [convoy-id]
Workstream: [repo/workstream]
Files:      [N files reviewed]
Reviewed:   [timestamp]

VERDICT: PASS / FAIL

FINDINGS (all confidence levels):
  1. [severity] [file:line] — [description]
     Confidence: [N]  Standard: [ref or "none"]

  2. ...

SUMMARY:
  Critical: N  |  High: N  |  Medium: N  |  Low: N
  Standards violations: N
  Test coverage gaps: N

NOTES:
  [Any context the reviewer wants to surface for the gate evaluator]
```

**PASS**: No critical or high-severity findings above the confidence threshold.
**FAIL**: One or more critical/high findings. Must be resolved before gate request.

---

## Receiving Review Feedback

When you are on the receiving end of a code review (human or agent):

1. **Verify technically before implementing.** Read the finding, check the code,
   confirm the issue exists. Do not blindly agree
2. **If the finding is correct**, fix it and note the fix
3. **If the finding is wrong**, explain why with evidence — cite the code, the
   test, or the standard. Respectful disagreement is expected
4. **If the finding is ambiguous**, ask for clarification before changing code

Performative agreement ("good catch, fixed!") without verification is a review
failure mode. The reviewer may be wrong. Check.

---

## Anti-Patterns

- **Rubber-stamping**: PASS verdict with no findings on a non-trivial change
- **Performative agreement**: Accepting every finding without verification
- **Style over substance**: 10 findings about formatting, zero about logic
- **Confidence inflation**: Scoring 90+ on speculative findings to appear authoritative
- **Missing the forest**: Reviewing line-by-line but missing architectural issues
