<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/net-new/stages/00-intake.md
# description: Stage 0 Intake directive for net-new convoys. Classify, score, spec.
# owner:       HUMAN
# update:      Manual when intake policy changes.
# schema:      none
# last_update: 2026-04-30
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Stage 0 of net-new.** Classify the request, populate `convoy.yaml`, sketch `living-spec.md` Intent + AC skeleton.
- **Convoys live in the central conduit repo only** — never bootstrap `convoys/` in target repos.
- **Model:** claude-sonnet-4-6 (judgment, not pattern matching).
- **Gate 0 = scope/risk classification + audience scores.** Don't advance without them.

# Stage 0 — Intake Directive (Net New)

## Convoy storage — central only (CLI-4 / AC-24)

Convoys live in the central conduit repo, never in target repos. `conduit convoy new`
captures the target repo's identity in `convoy.yaml` `metadata.target_repo` /
`metadata.target_repo_path` so source-code commits land in the right place.
See `directives/shared/convoy-agent-behavior.md` §0 for the full resolution rule.

## Recommended Model
**claude-sonnet-4-6** — Intake classification is a judgment task requiring business context understanding, not simple pattern matching. Haiku is insufficient for scope classification and risk assessment.

## What This Stage Produces
1. `convoy.yaml` — fully populated (id, title, work_type, work_item, bp_gate_required)
2. `living-spec.md` — Intent section and Acceptance Criteria skeleton complete
3. Work type classification decision (net-new confirmed, not a hidden enhancement)

## Context to Load
- `living-spec.md` — Intent section only (do not load Solution Design or What Was Actually Built)
- `CONDUIT.md` — Repo Signal block only

## Pre-Flight: Highway Check (ALWAYS run first)

Before loading any context, verify the target repo has been highway-initialized:

```
Does CONDUIT.md exist in the repo root?
```

**If NO:**
1. STOP immediately. Do not proceed with the directive.
2. Tell the human: "This repo has not been highway-initialized. Run `conduit highway init [path]` first, or paste the highway-init-questions.md questionnaire and I will create the CONDUIT.md, CONTEXT.md, and QA/ACCEPTANCE.md files for you."
3. Do not guess at repo signals. Wait for initialization before continuing.

**If YES:** Continue with Step 1 below.

## Step-by-Step Instructions

### Step 1 — Validate convoy.yaml fields
Read `convoy.yaml`. Confirm these fields are populated:
- `id`: a descriptive convoy slug
- `title`: clear, non-generic (not "New Feature" — must name the capability)
- `work_type`: set to `net-new`
- `work_item`: the tracking ID in your work tracker (if you use one)

If any are missing or generic, flag for human correction before proceeding.

### Step 2 — Assess external impact
Read the living-spec.md Intent section and judge how much this work affects
people outside the implementing team (end users, partners, other teams):
- **No / minor impact** — internal-only scope with no external exposure
- **Moderate impact** — may require communication to affected parties
- **Significant impact** — requires a BP Gate and stakeholder comms

Guidance:
- Significant external-facing impact → set `bp_gate_required: true`
- Internal-only scope with no external exposure → bp_gate typically not required

### Step 3 — Confirm net-new classification
Verify the request is genuinely net-new (capability that did not exist) and not a disguised enhancement.

Classification test:
- Does any existing codebase already partially implement this? → Enhancement, not net-new
- Is this a fix to something that was supposed to work? → Bug fix, not net-new
- Is this a new capability from scratch? → Net-new confirmed

If misclassified: update `work_type` in convoy.yaml and re-route to the correct directive.

### Step 4 — Draft the Acceptance Criteria skeleton
From the living-spec.md Intent, generate an initial set of acceptance criteria using the Given/When/Then format:

```
- [ ] Given [user state], when [user action], then [expected system response]
```

Minimum 3 criteria. Maximum depends on scope. These are a starting skeleton — Stage 1 (BA Requirements) will complete and refine them.

Flag any criterion you cannot write in Given/When/Then as an ambiguity to resolve at Gate 0.

### Step 5 — Work tracker child item audit [DETERMINISTIC]

This step is mandatory before Gate 0 can be approved. **Skip it entirely if you are not using a work tracker** for this convoy.

If you track work in an issue/work tracker, list all items that are children of this convoy's parent item. Compare against `tracker_items.gate_transitions` and `tracker_items.excluded`. Every child must appear in one of the two lists.

**Classification for each child:**
- In `gate_transitions` → tracked, will be moved at the appropriate gate ✓
- In `excluded` → intentionally excluded; reason recorded; will be reported at Gate 8 ✓
- **In neither → GAP. Blocks Gate 0.**

For each GAP item, present to the human:
```
GAP: #NNNNN "[title]" is a child of this parent item but is not in gate_transitions or excluded.
Options:
  A) Add it to this convoy's scope (add to gate_transitions)
  B) Exclude it (add to excluded with a reason — defer, assign to future convoy, or delete)
  C) Confirm it belongs to a different parent item and will be re-parented manually
```

Do not resolve GAPs on your own. Surface them and wait for the human's decision. Record all decisions in `convoy.yaml` before requesting Gate 0 approval.

**If the convoy has no `tracker_items` yet** (parent item not yet created): skip this step. The parent item will be created at Gate 0 approval.

### Step 6 — Update living-spec.md
Write the following sections:
- **Intent**: 2–3 sentences. What problem does this solve? For whom?
- **Audience Impact**: table with scores and brief notes per audience
- **Acceptance Criteria**: the skeleton from Step 4
- Leave Solution Design, Work Streams, Decisions Log, What Was Actually Built blank

Set stage to `0` in the living-spec.md header.

### Step 7 — Confirm tracker_items is complete
If you use a work tracker, before requesting Gate 0 approval `tracker_items` in convoy.yaml must have:
- `parent` — the convoy's own parent item ID
- `children` — at least one child item ID
- `excluded` — every child that won't be done by this convoy, with a reason
- `gate_transitions` — every item that will be done, mapped to its gate
- **Zero GAPs** — no unaccounted children

If you are not using a work tracker, skip this step.

## Gate 0 Criteria (Pre-Gate Checklist)
Before requesting Gate 0 approval, verify ALL of the following:

- [ ] `convoy.yaml` has no template placeholder values (no `{{...}}` remaining)
- [ ] Work type is correctly classified
- [ ] Audience scores are populated and defensible
- [ ] `bp_gate_required` is set correctly
- [ ] Living spec Intent is one paragraph minimum, clearly states the user problem
- [ ] At least 3 Given/When/Then acceptance criteria are drafted
- [ ] No acceptance criterion is vague ("system works correctly" is not acceptable)
- [ ] No solution design has been included at this stage (Intent only — no How yet)
- [ ] Work tracker child audit complete — every child of the parent item is in `gate_transitions` or `excluded` (skip if not using a tracker)
- [ ] Zero GAPs — no unaccounted tracker children remain (skip if not using a tracker)

## Common Failure Modes
- **Over-specifying at Stage 0**: Putting solution design in the Intent. Stage 0 is what and why, not how.
- **Generic titles**: "Improve performance" is not an Intent. Name the specific capability.
- **Wrong work type**: Enhancement requests routinely arrive as "net-new." Misclassification affects which stages run.
- **Missing BP gate flag**: External-facing changes that skip the BP Gate create stakeholder surprise.

## What to Escalate
- Business intent is unclear after reading all available input → escalate to `owner`
- Audience score conflict (two teams disagree on impact level) → escalate to `architect`
- Suspected security or compliance scope → escalate to `security` immediately, do not proceed
