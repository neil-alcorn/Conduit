<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/net-new/stages/07-bp-comms.md
# description: Stage 7 BP Comms directive. Audience-aware communications before release.
# owner:       HUMAN
# update:      Manual when comms policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **No commit/push, even though this stage is "just writing"** — report drafts and wait for the gate.
- **Read `convoy.yaml` audience scores first:** internal-only → internal announcement; any external-facing audience >= 3 → BP Gate communication (one page max).
- **Draft release notes** (what changed / who's affected / what to do / contact) with audience-calibrated tone; complete What Was Actually Built in living-spec.md.
- **Avoid:** internal jargon in external comms, announcements without a what-to-do — `bp_gate_required` is the arbiter, not "seems small."

# Stage 7 — Business Comms Directive (Net New)

## ⛔ COMMIT AUTHORITY — You are NOT authorized to commit or push

**You are NOT authorized to run `git commit` or `git push` in any repo during this stage.**

Committing before gate approval is a convoy violation. It makes the repo's git history inconsistent with the convoy audit trail. If a gate is rejected, a pre-approval commit requires a revert.

The authority chain is:
1. You complete the work and report findings in this session.
2. The human reviews and approves or rejects the gate.
3. **The Conduit window commits and pushes after approval.** Not before.

If you find yourself typing `git commit` or `git push` in this stage, **stop**. You are not authorized. Report your findings as text and wait for the gate decision.

This applies to ALL repos you touch in this stage. This applies even though Stage 7 feels like "just writing."

## Recommended Model
**claude-haiku-4-5** for drafting release notes and internal announcements.
**claude-sonnet-4-6** when any external-facing audience scores >= 3 (external-facing or high-impact comms require more nuanced tone and careful messaging).

## What This Stage Produces
1. Release notes — what changed and why, written for the audience
2. Stakeholder communications (if bp_gate_required: true)
3. Internal team announcement (always required)

## Context to Load
- living-spec.md — Intent and Audience Impact sections only
- living-spec.md — What Was Actually Built section (if populated)
- Do NOT load CONTEXT.md, CONDUIT.md, or ACCEPTANCE.md

## Step-by-Step Instructions

### Step 1 — Determine the comms scope from convoy.yaml
Check `bp_gate_required` and the external-impact assessment from Stage 0:
- Internal only, minor impact: internal announcement only
- Significant internal impact: detailed internal comms with training note if behavior changes
- Significant external-facing impact: BP Gate communication required

### Step 2 — Draft release notes

```
## [Feature Name] — Released [Date]

**What changed:** [One paragraph. What the feature does. Focus on user value.]

**Who is affected:** [Which users. Which workflows.]

**What to do:** [If user action required — training, updated process. If none, say so.]

**Questions:** [Contact name or channel]
```

Tone calibration:
- Internal team: direct, technical detail OK, honest about limitations
- External audiences: benefit-focused, action-oriented, no internal jargon
- Leadership: outcome-focused, metric-tied where possible

### Step 3 — Draft stakeholder communication (if bp_gate_required)
If bp_gate_required: true, produce a separate communication for the BP Gate reviewer:
- One page maximum
- What changed in their workflow (specifically)
- What action they need to take (if any)
- Timeline and support contact

### Step 4 — Complete What Was Actually Built in living-spec.md
Write a short summary of what was delivered:
- Features implemented (reference acceptance criteria)
- Features explicitly deferred
- Known limitations at release

## Gate 7 Criteria (Pre-Gate Checklist)
Before requesting Gate 7 approval, verify ALL of the following:

- [ ] Internal release notes drafted
- [ ] Tone appropriate for audience (not too technical for external)
- [ ] BP Gate communication drafted if bp_gate_required: true
- [ ] What Was Actually Built section complete in living-spec.md
- [ ] No implementation details in external-facing comms
- [ ] Contact or support channel specified in all communications

## Common Failure Modes
- Internal jargon in external comms: Convoy, Checkpoint, Work Stream are internal terms
- Missing the what-to-do: comms that announce change but do not tell users what they need to do
- Skipping BP comms because the change seems small: bp_gate_required is the arbiter

## What to Escalate
- Comms require legal or compliance review → escalate to compliance before Gate 7
- Leadership wants different messaging → escalate to owner
