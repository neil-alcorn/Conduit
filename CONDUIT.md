<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        CONDUIT.md
# description: Repo highway document for the CONDUIT local orchestration repo.
# owner:       BOTH
# update:      Updated during Highway Init and when repo signals or operating rules change.
# schema:      highways/repo-signals.schema.yaml
# last_update: 2026-04-16
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **This repo is the central Conduit orchestration root** — directives, convoys, registry, and schemas live here.
- **Convoys live only here**, never in target repos. `conduit convoy new` records the target repo's identity in convoy.yaml metadata.
- **Agents may** propose directive/template changes for human approval and validate convoy state. **Agents must not** bypass gates or change security controls without an audit trail.
- **Directive convention:** every `directives/**/*.md` starts with `## TL;DR` (≤150 tokens). Lint with `conduit docs tldr --check`.

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
content_signals:
  ai_input: yes
  ai_modify: scoped
  ai_train: no
work_tracker_project: "CONDUIT"
highway_init_date: "2026-04-04"
last_context_update: "2026-06-15"
context_freshness:
  max_commits_since_update: 5
  max_days_since_update: 14
  on_stale: warn
  context_md_owner: "neil"
  last_context_update: "2026-06-15"
```

## What This Repo Is

This is the Local Orchestration Repo developers clone to read directives, manage convoys, run gate sync, and register Highway documents across the CONDUIT network.

## What Agents May Do Here

- Read and update orchestration state that is explicitly marked as agent-managed.
- Propose changes to templates, directives, and integration definitions for human approval.
- Validate convoy state, gate readiness, and highway registrations.

## Directive Authoring Convention — TL;DR First

Every directive (`directives/**/*.md`) starts with `## TL;DR` immediately
after the managed-file comment header. Budget: ≤150 tokens (2–5 bullets).
Cover when the directive applies, what to do, what to avoid. Agents read
the TL;DR first and only load the full directive when they need detail —
this is the primary lever for keeping the agent context window cheap.

- New directives: include a real TL;DR in the same PR.
- Audit: `conduit docs tldr --check` flags missing / stub / over-budget.
- Scaffold: `conduit docs tldr --apply` inserts a stub for any directive
  missing the section. Replace placeholders by hand.

## What Agents Must Not Do Here

- Bypass gates or treat a human approval checkpoint as optional.
- Change security controls, escalation routing, or repo signals without leaving an auditable trail.
- Treat downstream application repos as in scope without first using the Highway Index and repo signals.

## Primary Audiences

- Developers building and operating software with CONDUIT.
- Architects, security reviewers, and compliance partners reviewing gate decisions.
- Stakeholders consuming summarized status through the work tracker and the dashboard.

## Linked Highway Documents

- `CONTEXT.md` is introduced by Highway Init in downstream repos and maintained as the living architecture summary.
- `QA/ACCEPTANCE.md` in target repos defines the acceptance criteria registry used by QA and gate evaluation.
