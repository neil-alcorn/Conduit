<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/second-approver-prompt.md
# description: Reusable template prompt for pasting to a four-eyes gate approver.
# owner:       BOTH
# update:      Manual when the approver onboarding flow changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Use when four-eyes blocks self-approval** — fill this template, save to `convoys/active/<id>/audit/approver-prompt-gate-<N>.md`, and hand the gate to a teammate. Fill every placeholder before sharing.
- **Approver needs a different git identity** than the requester and must evaluate independently per `gate-evaluator.md` — never rubber-stamp.
- **Gate 3:** approver checks out `review/<CONVOY-ID>` to review real code. A tracker integration is not required to approve — either party fires transitions afterward.

# Second-Approver Prompt — Template

Use this template when Conduit's four-eyes rule blocks a self-approval and you
need to hand off the gate to a teammate. Save a filled copy at
`convoys/active/<convoy-id>/audit/approver-prompt-gate-<N>.md` and share the
path (or paste the fenced block) to your second approver.

**Placeholders to fill:**
- `<CONVOY-ID>` — e.g. `feature-unification-polish`
- `<WORK-ITEM-ID>` — parent work item number in your tracker
- `<GATE-N>` — e.g. `gate-3`
- `<STAGE-N>` — e.g. `3 — Implementation`
- `<REQUESTER>` — git/username of the person who ran `gate request`
- `<RECAP>` — 3–6 bullets summarizing what's in the request (ACs, defects
  fixed, PARTIAL items with reason, notable commits)
- `<TRACKER-TRANSITIONS>` — list of work items that will move on approval
  (pulled from `convoy.yaml → work_items.gate_transitions[gate: N]`)
- `<STAGE-DIRECTIVE>` — path under `directives/<work-type>/stages/`, e.g.
  `directives/net-new/stages/03-implementation.md`

---

## Template (copy, fill placeholders, share)

````
You're being asked to perform a four-eyes review and approval of a Conduit
gate. <REQUESTER> has requested <GATE-N> on the <CONVOY-ID> convoy. You
cannot approve your own requests under Conduit's separation-of-duties rule,
which is why <REQUESTER> is asking you.

## 1. Make sure you have a current Conduit checkout

If you have the Conduit repo locally, pull latest. If you don't, clone it:
  <your-conduit-repo-url>

Then:
  cd <path-to-your-conduit-checkout>
  git pull --ff-only
  npm --prefix . run build

## 1b. Check out the review branch (Gate 3 only)

The Stage 3 implementation is on a `review/<CONVOY-ID>` branch
— it is NOT on master. You must check out this branch to read the real code and run
the real tests. Without it, you are reviewing the requester's description, not the code.

  cd <path-to-target-repo>
  git fetch origin
  git checkout review/<CONVOY-ID>
  <VERIFY-COMMAND>   ← run the test suite against this branch

## 2. Read the gate request and the supporting artifacts

Required reading before approval (all in the Conduit repo):
  - convoys/active/<CONVOY-ID>/audit/gate-request-<N>.md   — requester's body
  - convoys/active/<CONVOY-ID>/audit/gate-context-<N>.md   — assembled context
  - convoys/active/<CONVOY-ID>/living-spec.md              — design + ACs
  - convoys/active/<CONVOY-ID>/audit/gate-log.jsonl        — prior gate history
  - <STAGE-DIRECTIVE>                                      — this gate's checklist
  - directives/shared/gate-evaluator.md                    — how to evaluate

Short version:
  - Convoy: <CONVOY-ID> (work item <WORK-ITEM-ID>)
  - Stage <STAGE-N>
  <RECAP>
  - Tracker transitions waiting to fire on approval: <TRACKER-TRANSITIONS>

## 3. Your job

Produce an independent GATE EVALUATION REPORT per directives/shared/gate-
evaluator.md — don't trust the requester's recommendation blindly. Confirm:
  - Are all ACs in the living-spec really covered in the gate request?
  - Any claims that look too clean — spot-check them against git log / code.
  - Any auto-ESCALATE conditions (security, PII, unapproved deps,
    undisclosed schema migrations, Stage 5 unresolved HIGH SAST)?

## 4. If approve, run:

  cd <path-to-your-conduit-checkout>
  node dist/cli/src/index.js gate approve <CONVOY-ID> <GATE-N>

The CLI will auto-commit and push. Tell <REQUESTER> it's done so they can
fire the tracker transitions from their session (or you can, if you have the
tracker integration configured).

## 5. If you want to send back or escalate:

  node dist/cli/src/index.js gate reject <CONVOY-ID> <GATE-N>
  (or)
  # For escalate, leave gate pending and ping <REQUESTER> + architect

Either way, write up your reasoning — a rejected gate is not a silent act.
````

## Notes

- The approver's git identity must differ from the requester's. The CLI
  compares on `git config user.email` (or the equivalent). If the approver
  inherits a shared identity, four-eyes will refuse them too — easy to
  check with `git config user.email` before approving.
- The approver does **not** need a tracker integration configured to approve.
  It is only needed for the subsequent work-item state transitions, which can be
  fired by either party once the gate is recorded.
- Once the approval commits to master, the requester's next `conduit
  context` or `conduit status` call surfaces the new state — there is no
  automatic notification back to the requester's Claude session.
