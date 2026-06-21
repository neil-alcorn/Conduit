<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/net-new/stages/08-release.md
# description: Stage 8 Release directive. Deploy, verify, CONTEXT.md update, close Convoy.
# owner:       HUMAN
# update:      Manual when release policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Deterministic checklist — do not improvise, do not commit.** Verify gates 0–7, trigger the deploy pipeline, smoke-test production, update CONTEXT.md for every touched repo, then report and wait for Gate 8.
- **If MigrateDb fails: STOP** — escalate to architect. Failed pipelines get a fresh run, never a stage rerun.
- **The Conduit window closes out after approval:** gate_history + `status: closed`, events, work-tracker updates, archive, commit/push.
- **Never close before the smoke test.** After close, list pending/active convoys and ask what's next.

# Stage 8 — Release Directive (Net New)

## ⛔ COMMIT DISCIPLINE

**Do NOT commit or push.** Execute the checklist, report results, wait for Gate 8 approval. The Conduit window commits after approval. Release is DETERMINISTIC — follow the checklist, do not improvise, do not commit.

## Recommended Model
**claude-haiku-4-5** — Release is checklist execution, not reasoning. Every step is deterministic. Use Haiku to minimize cost. Escalate to Sonnet only if a release issue requires diagnosis.

## What This Stage Produces
1. Deployment completed and verified in production
2. CONTEXT.md updated for all affected repos
3. Convoy closed in conduit registry and the tracked work item resolved (if you use a work tracker)
4. Process event logged to .conduit/events.jsonl

## Context to Load
- living-spec.md — What Was Actually Built section only
- CONDUIT.md — full (need operational status and escalation contacts)

## Step-by-Step Instructions

### Step 1 — Pre-deployment verification
Before triggering any deployment:
- [ ] All previous gates passed (0 through 7)
- [ ] No open security findings from Stage 5
- [ ] Release notes from Stage 7 are approved
- [ ] Your deployment pipeline is green on the main branch

### Step 2 — Trigger deployment
Trigger your deployment pipeline per the repo's documented release process.
Monitor every stage it runs (typically: provision → build → migrate → deploy).

If a database migration step fails: STOP. Do not proceed to deploy. Escalate to architect immediately.
If the deploy step fails: check the deployment logs. Do not restart individual pipeline stages — start a fresh run.

### Step 3 — Post-deployment verification
After the pipeline completes:
- Navigate to the production URL and verify the feature is accessible
- Confirm auth still works (login → primary view loads)
- Execute the primary acceptance criterion manually (smoke test)
- Check the deployment / runtime logs for startup errors

### Step 4 — Update CONTEXT.md for all affected repos
For each repo in the Convoy Work Streams, update CONTEXT.md:
- Add entry to Significant Changes (Last 90 Days)
- Update last_context_update date in CONDUIT.md header

This is mandatory. Do not close the Convoy without updating CONTEXT.md.

### Step 5 — Report to human; await Gate 8 approval

At this point the implementation agent's job is done. Report:
- Pipeline result (green/failed)
- Smoke test result (pass/fail + what was tested)
- Any errors or concerns

**Do not close the convoy. Do not commit. Wait for Gate 8 approval from the human.**

The Conduit window runs Steps 6–9 after approval.

### Step 6 — [CONDUIT WINDOW] Add Gate 8 to convoy.yaml gate_history

```yaml
- gate: 8
  approved_by: "[approver]"
  approved_at: "YYYY-MM-DD"
  notes: "Release PASS. Pipeline green. Smoke test confirmed — [what was verified]."
```

Also set `status: closed` in convoy.yaml.

### Step 7 — [CONDUIT WINDOW] Append events

```json
{"ts":"...","type":"gate_passed","convoy":"[id]","stage":8,"approver":"[approver]","duration_hours":N,"notes":"Release PASS. Pipeline green. Smoke test confirmed."}
{"ts":"...","type":"convoy_closed","convoy":"[id]","work_type":"net-new","stages_completed":9,"rework_count":N,"released_by":"[approver]","notes":"[summary]"}
```

### Step 8 — [CONDUIT WINDOW] Close out the tracked work item

If you use a work tracker, transition the convoy's work items to their closed/resolved
state (parent item and all in-scope children). Skip this step if you are not using a tracker.

### Step 9 — [CONDUIT WINDOW] Archive and commit

```bash
mv convoys/active/[convoy-id] convoys/archive/[convoy-id]
```

Commit all three repos (implementation changes + conduit convoy files). Push.

## Gate 8 Criteria (Pre-Gate Checklist — implementation agent verifies before reporting)
- [ ] All previous gates passed (0 through 7)
- [ ] Deployment pipeline completed green
- [ ] Smoke test passed in production (at least one preserve criterion verified for enhancements)
- [ ] No errors in the deployment / runtime startup logs
- [ ] CONTEXT.md updated for all repos touched in this convoy

## Gate 8 Close Checklist (Conduit window completes after approval)
- [ ] Gate 8 added to convoy.yaml gate_history; `status: closed`
- [ ] gate_passed + convoy_closed events appended to events.jsonl
- [ ] Tracked work items closed/resolved (skip if not using a tracker)
- [ ] Convoy moved from active → archive
- [ ] All repos committed and pushed
- [ ] current-state.md updated to reflect what shipped

## Common Failure Modes
- Skipping CONTEXT.md update: the next agent session will read stale architecture
- Rerunning a failed pipeline stage: always start a fresh run, rerunning reuses old checkout
- Closing Convoy before smoke test: verification must happen before closure

## What to Escalate
- Database migration step fails → escalate to architect immediately, do not proceed to deploy
- Production smoke test fails after successful deploy → escalate to architect, do not close Convoy
- Deployment causes regression in previously working features → open a bug-fix Convoy immediately

---

## After Gate 8 Closes — What's Next

Once the convoy is archived, prompt the human:

1. Check `conduit/convoys/pending/` — list any pending convoys and their readiness status
2. Check `conduit/convoys/active/` — list any other in-flight convoys and their current stage
3. Ask: **"What would you like to work on next?"**

If a pending convoy has all prerequisites met (prior convoys it depends on are closed), say so explicitly — e.g., "the dependent-audit convoy is ready to activate. It was waiting for this convoy to close."

Keep this prompt short. One paragraph max. The human decides what comes next.
