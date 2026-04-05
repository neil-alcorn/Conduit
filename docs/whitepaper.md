<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/whitepaper.md
# description: Repo-native whitepaper for CONDUIT vision, architecture, principles, and operating model.
# owner:       BOTH
# update:      Update when system vision, architecture, or delivery philosophy materially changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# CONDUIT Whitepaper

## Executive Summary

CONDUIT is an AI-native software delivery orchestration system designed for Horace Mann's regulated, multi-system, multi-audience environment.

Its purpose is to route the right work to the right agents with the right context, from requirement to release, while keeping human judgment where it matters most and making security a structural property rather than an afterthought.

CONDUIT is not centered on code generation alone. It is centered on coordination:

- coordination across agents
- coordination across repos and systems
- coordination across technical and business stakeholders
- coordination across intent, implementation, QA, security, and release

The system replaces coordination overhead with a persistent orchestration layer built from deterministic context documents, differentiated work pipelines, runtime guardrails, and explicit human Gates.

## Mission

Route the right work to the right agents with the right context, from requirement to release, automatically.

## Why CONDUIT Exists

Three core observations drive the design:

1. The bottleneck in modern software delivery is often not writing code. It is coordinating context across people, agents, repos, systems, and decisions.
2. Human judgment belongs upstream in intent-setting, acceptance criteria, and gate approval, not downstream as line-by-line rework after the fact.
3. In Horace Mann's environment, field-agent experience, customer impact, employee workflow, and vendor/partner effects must be explicit delivery outputs, not implied side effects.

CONDUIT exists to turn those observations into a concrete operating model.

## Design Principles

### Best Idea Wins

CONDUIT borrows from Lean, Gas Town, intent-based development, value-stream thinking, and practical delivery experience. It does not preserve borrowed language for its own sake. It keeps what works and renames what must be made clearer.

### Descriptive Over Clever

Every important term should make sense on first read. If a term requires explanation every time it appears, it is the wrong term.

### Security Is Structural

Security is not a finishing step. Injection hardening, auditability, fail-closed behavior, and human approval Gates are load-bearing architectural choices.

### Context Is Permanent

Agent sessions are ephemeral. CONDUIT state is not. The durable artifacts are the highways, convoy records, workstream status, checkpoints, logs, and gate decisions.

### People First

Field agents, customers, employees, and vendor/partner audiences are explicit parts of delivery decisions. CONDUIT treats audience impact as a first-class concern.

## Core Primitives

### Information Highways

The Information Highway is the deterministic context layer for a repo:

- `CONDUIT.md`
- `CONTEXT.md`
- `QA/ACCEPTANCE.md`

These documents give agents the minimal high-value context needed to act without forcing a full-codebase read for every task.

### Work Type Directives

CONDUIT uses differentiated pipelines for distinct work types:

- net-new
- enhancement
- maintenance
- bug-fix

Each work type can follow a different path through the same overall system while still sharing the same vocabulary, security model, and gate structure.

### Convoys, Work Streams, And Checkpoints

- A `Convoy` is the unit of intent.
- A `Work Stream` is the repo-scoped execution lane inside a Convoy.
- A `Checkpoint` is the atomic unit of work inside a Work Stream.

This model allows one business objective to span multiple repos without losing repo-local execution clarity.

### Gate Sync

Gate Sync refreshes orchestration state before gate evaluation so approval happens against known, current context.

In the current implementation, Gate Sync records the sync ref and avoids mutating the approval context by merging remote changes during review.

### The Eisenhower Initiative

The Eisenhower Initiative is the one-time program for bringing Horace Mann repos onto the CONDUIT network through Highway Init and Highway Index registration.

## Delivery Philosophy

CONDUIT is designed around the idea that the strongest delivery systems:

- constrain agents rather than merely advising them
- verify behavior deterministically rather than relying on trust
- preserve intent and decisions as durable artifacts
- make approval points explicit
- reduce downstream review churn by improving upstream clarity

This means the system is intentionally opinionated:

- agent autonomy is scoped
- external content is treated as hostile by default
- gates are not optional
- runtime controls matter more than policy statements alone

## Security Model

The security posture of CONDUIT is based on three ideas.

### Hostile External Content

Any content originating outside the controlled repo context should be treated as potentially adversarial. That includes user-entered intake content, imported text, and any future external code ingestion paths.

### Fail-Closed Operation

If a required control cannot run, CONDUIT should block rather than continue optimistically.

### Guardrails Before Intelligence

The system must establish safe boundaries before broadening agent power.

Current repo-native enforcement includes:

- ingress sanitization for `conduit convoy new`
- `living-spec.md` sanitizer precheck during session start
- fail-closed Repo Signal permission enforcement for repo-targeting CLI commands

## Human Judgment And Gates

CONDUIT does not remove human judgment. It relocates it to the highest-leverage points:

- defining intent
- writing acceptance criteria
- shaping solution direction
- approving Gate decisions
- deciding when release is acceptable

The goal is not fewer humans. The goal is fewer low-value human loops and more deliberate human decisions.

## Repo Architecture

CONDUIT is designed as a three-repo system.

### `conduit`

The local orchestration repo.

It contains:

- directives
- highways
- convoys
- agents
- gates
- security ingress logic
- integration scaffolding

This is the repo every developer clones.

### `conduit-core`

The shared contract layer.

It contains:

- shared TypeScript types
- shared JSON schemas
- shared constants
- shared ADO mappings
- shared database schema surface

Its purpose is to prevent drift between orchestration logic and downstream consumers.

### `conduit-app`

The future dashboard/backend.

It is expected to consume `conduit-core` and present system state, approvals, and integration views, but it is intentionally deferred at the current stage.

## Current Implementation Boundary

This whitepaper describes the intended system, but not every part of that intended system is fully implemented yet.

As of the current repo state:

- the architectural skeleton is present
- the vocabulary and structure are established
- ingress sanitization and Repo Signal checks are enforced
- self-registration and Release Gate protocol are in place
- many operational command bodies remain scaffolded

For the implementation boundary, see:

- [docs/current-state.md](/C:/Users/nalco/.codex/Conduit/docs/current-state.md)
- [docs/security-model.md](/C:/Users/nalco/.codex/Conduit/docs/security-model.md)

## What Success Looks Like

A successful CONDUIT deployment produces:

- faster movement through delivery stages without sacrificing control
- clearer context for both humans and agents
- stronger, earlier security boundaries
- explicit, measurable audience impact
- less coordination drag across multiple repos and systems
- a durable audit trail of intent, execution, and approval

## Who This Document Is For

This whitepaper is meant for:

- engineering leadership
- architects
- security reviewers
- delivery owners
- new developers onboarding to the system
- future maintainers of `conduit`, `conduit-core`, and `conduit-app`

## Companion Documents

- [docs/architecture.md](/C:/Users/nalco/.codex/Conduit/docs/architecture.md)
- [docs/security-model.md](/C:/Users/nalco/.codex/Conduit/docs/security-model.md)
- [docs/current-state.md](/C:/Users/nalco/.codex/Conduit/docs/current-state.md)
- [docs/handoff.md](/C:/Users/nalco/.codex/Conduit/docs/handoff.md)
- [docs/concept/vision-and-architecture.md](/C:/Users/nalco/.codex/Conduit/docs/concept/vision-and-architecture.md)

## Source Note

This whitepaper is derived from the original concept document and updated to reflect the current repo-native architecture and implementation boundary.
