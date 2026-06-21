<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/adr/004-three-layer-developer-integration.md
# description: ADR for the three-layer developer integration model.
# owner:       HUMAN
# update:      Amend only when the decision changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# ADR-004: Three-Layer Developer Integration

Date: 2026-04
Status: Accepted

## Context

CONDUIT must serve developers directly, surface status inside editors, and preserve enterprise records in a work tracker.

## Decision

Adopt a three-layer model:

1. Local Orchestration Repo as the foundation.
2. Editor extension as the in-editor display layer.
3. Work-tracker integration as the enterprise record layer.

## Rationale

- Keeps the core orchestration system editor-agnostic.
- Improves local UX without coupling orchestration to a single tool.
- Preserves compliance and audit workflows in the system stakeholders already use.
