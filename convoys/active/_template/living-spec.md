<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        convoys/active/{{CONVOY_ID}}/living-spec.md
# description: Template for the self-updating living specification of a convoy.
# owner:       BOTH
# update:      At every stage transition — agents update, humans approve at gates.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Living Spec: {{TITLE}}

**Convoy:** {{CONVOY_ID}}  |  **Work Type:** {{WORK_TYPE}}  |  **Stage:** {{STAGE}}
**Last Updated:** {{DATE}}  |  **Updated By:** {{AGENT_OR_HUMAN}}

---

## Intent

{{INTENT}}

## Audience Impact

| Audience | Score | Notes |
|----------|-------|-------|
| Field Agent | {{SCORE}} | {{NOTES}} |
| Customer | {{SCORE}} | {{NOTES}} |
| Employee | {{SCORE}} | {{NOTES}} |
| Vendor/Partner | {{SCORE}} | {{NOTES}} |

## Acceptance Criteria

- [ ] {{CRITERION_1}}
- [ ] {{CRITERION_2}}

## Solution Design

{{DESIGN_SUMMARY}}

## Work Streams

| Work Stream ID | Repo | Stage | Status | Depends On |
|----------------|------|-------|--------|------------|
| {{WS_ID}} | {{REPO}} | {{STAGE}} | {{STATUS}} | {{DEPS}} |

## Decisions Log

| Date | Decision | Rationale | Made By |
|------|----------|-----------|---------|

## What Was Actually Built

{{RELEASE_SUMMARY}}

## Gate History

| Gate | Stage | Approver | Date | Decision |
|------|-------|----------|------|----------|
