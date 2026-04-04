<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        CONDUIT.md
# description: Repo highway document for the CONDUIT local orchestration repo.
# owner:       BOTH
# update:      Updated during Highway Init and when repo signals or operating rules change.
# schema:      highways/repo-signals.schema.yaml
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# CONDUIT Local Orchestration Repo

## Repo Signals

```yaml
operational_status: ACTIVE
system_class: MODERN
escalation_contacts:
  owner: "TBD"
  architect: "TBD"
  security: "TBD"
  compliance: "TBD"
  specialist: ""
audience_defaults:
  field_agent: 1
  customer: 1
  employee: 5
  vendor_partner: 1
leanix_id: "TBD"
ado_project: "CONDUIT"
highway_init_date: "2026-04-04"
last_context_update: "2026-04-04"
```

## What This Repo Is

This is the Local Orchestration Repo every Horace Mann developer clones to read directives, manage convoys, run gate sync, and register Highway documents across the CONDUIT network.

## What Agents May Do Here

- Read and update orchestration state that is explicitly marked as agent-managed.
- Propose changes to templates, directives, and integration definitions for human approval.
- Validate convoy state, gate readiness, and highway registrations.

## What Agents Must Not Do Here

- Bypass gates or treat a human approval checkpoint as optional.
- Change security controls, escalation routing, or repo signals without leaving an auditable trail.
- Treat downstream application repos as in scope without first using the Highway Index and repo signals.

## Primary Audiences

- Employees building and operating software with CONDUIT.
- Architects, security reviewers, and compliance partners reviewing gate decisions.
- Business partners consuming summarized status through ADO and the dashboard.

## Linked Highway Documents

- `CONTEXT.md` is introduced by Highway Init in downstream repos and maintained as the living architecture summary.
- `QA/ACCEPTANCE.md` in target repos defines the acceptance criteria registry used by QA and gate evaluation.
