<!--
# ── CONDUIT MANAGED FILE ─────────────────────────────────────────────
# file:        docs/roadmap.md
# description: Strategic roadmap for Conduit and the broader delivery ecosystem.
# owner:       HUMAN
# update:      Manual — updated at major milestones
# schema:      none
# last_update: 2026-04-18
# ─────────────────────────────────────────────────────────────────────
-->

# Roadmap: Conduit

> **Work-item model:** Convoy = one tracked work item (one-to-one). A workstream maps to a child item; a stage deliverable maps to a sub-item. Phase/initiative planning lives here in roadmap.md — not as tracked items.

---

## The North Star

**Conduit** orchestrates how work gets done — routing the right work to the right agents with the right context, from requirement to release, while keeping human judgment at the highest-leverage points.

The roadmap below tracks Conduit's own capability buildout, followed by the generic pattern for delivering applications *through* Conduit.

---

## Phase 1 — Complete Conduit Core ✅ COMPLETE

All Phase 1 items shipped. Conduit CLI is fully operational.

### 1.1 ✅ Gate Evaluation Logic — COMPLETE
- `conduit gate eval/approve/reject` — real gate mutations + JSONL audit log
- `conduit checkpoint create/update/list` — full checkpoint lifecycle

### 1.2 ✅ Events Instrumentation + Staleness Detection — COMPLETE
- `conduit events` — events.jsonl instrumentation
- CONTEXT.md staleness detection surfaced in CLI

### 1.3 ✅ Optional Registry API Surface — COMPLETE
- HTTP endpoints for the optional registry: gate events (list/request/approve/reject), convoys (summary), checkpoints (pass/fail)
- checkpoint_events table + migration in conduit-core
- CLI auth design documented

### 1.4 ✅ conduit-core Schema Consolidation — COMPLETE
- conduit-core owns all Drizzle schemas; consumers import via `@conduit/core/db`

### 1.6 ✅ Planning & Execution Engine — COMPLETE
- New CLI commands: plan, execute, review, debug, session, skill
- New shared directives for spec-driven development, autonomous execution, code review, debugging, session handoff, verification, parallel dispatch, TDD
- New conduit-core types: PlanSpec, DebugSession, SessionHandoff, CodeReview, ExecutionManifest
- Convoy template enhanced with research/, sessions/, plan.md, impact-map.md
- Absorbs best patterns from spec-driven development, harness engineering, and token efficiency research

### 1.7 ✅ Requirements Decomposition — COMPLETE
- `conduit decompose` command: generate, lint, review, approve, apply, status
- Lint rules for requirement quality, ported to TypeScript
- Tagging standard: convoy + repo + work-item tags on all generated items
- Story Points auto-derived from Clarity × Complexity matrix
- Staged approval workflow with SHA-256 fingerprints
- Install scripts for Windows (PowerShell) and Mac/Linux (Bash)
- CLI visual indicators: ANSI colors, tagged prefixes, mode banners

### 1.5 ✅ CLI → Optional Registry Integration — PARTIALLY COMPLETE
- `conduit skill sync` pushes skills to the registry API for the approval workflow
- `conduit skill install` pulls approved skills from the registry
- **Remaining:** wire gate approve/checkpoint to call the registry API directly (currently local-first)

> **Note:** In the current build, the work-tracker integration is a placeholder (`conduit sync` is a stub) and the registry sync is provider-neutral and optional.

---

## Phase 2 — First Real Delivery Convoy

**Goal:** Use Conduit to deliver a real application shell end-to-end. This is the proving ground for the pipeline.

### 2.1 Initialize the Convoy
- Create Convoy in Conduit: work type `net-new`
- Write living-spec.md: scope, audience impact scores
- Gate 0: Intake approval
- Assign developer pair

### 2.2 Boilerplate Shell Work Streams
A typical app shell breaks into work streams like:

| Work Stream | What |
|---|---|
| Core scaffold | Framework + ORM + database + SSO |
| Navigation shell | Module routing, layout, sidebar |
| Accessibility | WCAG baseline, skip links, ARIA |
| UAT mode | Walkthrough overlay, step-by-step guide |
| Bug reporter | AI multi-step report |
| Monitoring | Error tracking |
| Infrastructure | Deployment pipeline |

### 2.3 Gate Sequence
- Gate 1 (Spec): Accept living-spec for boilerplate
- Gate 2 (Design): Architecture review, module interface contracts
- Gate 3 (QA): Accessibility, UAT, bug reporter tested
- Gate 4 (Security): SSO, injection hardening, secrets
- Gate 5 (Release): Deploy boilerplate to a dev environment

---

## Phase 3 — Module Buildout (Through Conduit)

**Goal:** Each feature/module is a Conduit Convoy, built by a developer pair, tracked through the full pipeline.

**Recommended sequencing principles:**
1. Build foundational/shared capabilities first (e.g. task + assignment engines) — they unblock everything else.
2. Replace fragmented manual processes before adding net-new capability.
3. Defer sensitive features (anything touching HR, privacy, or finance data) until the appropriate stakeholder review is complete.
4. Migrate existing apps into the shell rather than rewriting them from scratch.

---

## Phase 3.5 — Optional Registry Management UI

**Goal:** Give reviewers the ability to view and manage Conduit from the optional registry — no file editing required.

Target surfaces:

| Surface | Status |
|---|---|
| Active convoy board — KPIs, stage progress, rework tracking | candidate |
| Convoy detail + timeline — merged gate/checkpoint/executor events | candidate |
| Gate queue — pending approvals, approve/reject from UI | candidate |
| Workstream health — checkpoint/stage staleness detection | candidate |
| Highway index — repo signals, context staleness | candidate |
| Skills registry — view, approve/reject, approval history | candidate |
| Behaviors editor — toggle CLI policies, commit to git | candidate |

These are optional: Conduit runs fully from the CLI without any UI.

---

## Open Questions (Need Answers Before Building)

1. **Registry hosting** — who hosts the optional registry, and what auth model does it use?
2. **Work-tracker integration** — which tracker (if any) does the team standardize on, and what is the field mapping to Convoy/Workstream/Checkpoint?
3. **Sensitive-data features** — anything touching HR, privacy, or finance needs a stakeholder review before building.
4. **Developer pair assignments** — how are pairs decided, and does Conduit need to track this or is it managed elsewhere?

---

## What We Are NOT Doing

- Rebuilding everything from scratch — existing apps are migrated into the shell, not rewritten
- Building UI/registry features before Conduit core is complete
- Building sensitive features before the relevant review
- Diverging from the team's standard stack for new modules without an explicit decision
