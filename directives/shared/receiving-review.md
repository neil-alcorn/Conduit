<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/receiving-review.md
# description: Protocol for processing inbound code-review feedback. Counterpart to code-review-protocol.md.
# owner:       BOTH
# update:      Manual — approved policy changes only.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Applies when you RECEIVE review feedback** (findings `FND-NNNN` with severity blocking/major/minor/suggestion). Producing a review is `code-review-protocol.md` instead.
- **Per finding, in order: Understand → Verify against the code → Investigate root cause → Decide** (`fix-now` / `fix-follow-up` / `disagree` / `defer`), recorded against the finding ID.
- **Severity calibrates rigor:** `blocking` must be fix-now or an accepted rebuttal before merge — never fix-follow-up; never merge with an unresolved `disagree` on a blocking finding.
- **Avoid performative agreement and blind implementation** — reviewers can be wrong; verify before changing code, and disagree only with evidence.

# Receiving Code Review — Rigor Before Implementation

> **Load this directive when:** a developer is processing inbound code-review feedback, before implementing any suggestion. This is the counterpart to `directives/shared/code-review-protocol.md` (which governs producing reviews). When `conduit-review` is invoked in receive-mode, this is the directive that applies.

## Purpose

Blind implementation of review feedback is as harmful as dismissing it. Both fail the same test: the reviewer's intent was not understood. This directive establishes a checklist for processing each finding before you touch code.

Findings arrive with stable identifiers (`FND-NNNN`) and severity (`blocking` / `major` / `minor` / `suggestion`). Treat those as the contract — every response applies to one finding, referenced by ID.

## Trigger

Load this directive when the developer is the **recipient** of review feedback, not the author. Clues:

- Inbound findings from a `conduit review` run (own or peer)
- A teammate's review comments on a pull request
- An automated review output (SAST, linter, Conduit multi-agent review)
- Any variant of "here are the issues I found"

**Do not** load this directive when producing a review — that is `code-review-protocol.md`.

## The four-step checklist

For every finding, in order. Do not skip.

### 1. Understand

Read the finding in full. Re-read if the point is subtle. Ask yourself:
- What specific behavior or risk is the reviewer naming?
- Which file and line are implicated? Load them if you have not already.
- What standard or invariant does the reviewer believe is being violated?

**Do not proceed until you can summarize the finding in your own words.** If you cannot, ask the reviewer to clarify. Performative agreement without understanding is the most common failure mode.

### 2. Verify

Confirm the finding against the actual code:
- Does the behavior the reviewer describes match what the code actually does? Run the code or trace the flow.
- Is the reviewer's implicit assumption still valid? (Code changes between review rounds.)
- Is there a test that demonstrates the issue? If not, can you write one?

**Verification can invalidate a finding.** Reviewers misread code sometimes. If verification contradicts the finding, say so, with evidence — do not silently disagree.

### 3. Investigate

For findings that survive verification, dig into root cause:
- Is this the same issue that produced a past incident? Link it.
- Are there other sites in the codebase with the same pattern? A fix in one spot may mask the systemic issue.
- Does the fix require a standard change, or is it local?

**Investigation is how minor findings become systemic fixes** — or the other way around. A minor-severity finding may reveal a `blocking`-severity pattern; escalate severity if warranted.

### 4. Decide

Choose one disposition per finding:

| Disposition | Meaning |
|---|---|
| `fix-now` | Apply the change in this PR / convoy. |
| `fix-follow-up` | File a follow-up task; not blocking this merge. |
| `disagree` | Explain why, with evidence. Request reviewer re-read. |
| `defer` | Not applicable or not actionable now; document the reasoning. |

Record the disposition against the finding ID so the review log is self-contained.

## Severity → response calibration

| Severity | Default response rigor | Notes |
|---|---|---|
| `blocking` | Must be `fix-now` or `disagree` with reviewer-accepted rebuttal before merge. `fix-follow-up` is not permitted. | Legacy `must-fix` maps here. |
| `major` | Typically `fix-now`. `fix-follow-up` allowed with a filed task and explicit acknowledgement. | Legacy `should-fix` maps here. |
| `minor` | `fix-now` or `fix-follow-up`. Rarely `defer`. | New tier — no legacy alias. |
| `suggestion` | Evaluate. Any disposition valid, including `defer` with one-line reasoning. | New tier — lowest rigor, but still recorded. |

Severity is authored by the reviewer, not inferred. If you believe a severity is wrong, raise it explicitly — do not silently re-tier.

## Anti-patterns

- **Performative agreement.** Replying "good point, will fix" without understanding what the point actually is. Produces shallow fixes that do not address the reviewer's concern.
- **Blind implementation.** Applying the suggested change verbatim without verification. Reviewers sometimes propose fixes that are worse than the bug — your job is to decide, not to execute.
- **Dismissing without evidence.** "I don't think that's right" without a trace, a test, or a line reference. If you disagree, verify.
- **Batch disposition.** Marking every finding `fix-now` without per-finding investigation. Misses the systemic fixes Investigation exists to surface.
- **Ignoring severity.** Treating `suggestion` the same as `blocking`, or vice versa. Severity is the reviewer's calibration of rigor; honor it.
- **Losing the finding ID.** Discussing findings without referencing `FND-NNNN`. Breaks the audit trail — if there is no ID, ask for one or assign one.

## Escalation

If a finding is `blocking` severity and you intend to `disagree`, escalate to the reviewer before merge. Do not merge with an unresolved `disagree` on a `blocking` finding. If the reviewer is unavailable, pause the convoy and file a session handoff rather than forcing the decision.
