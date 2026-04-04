<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        integrations/ado/README.md
# description: Overview of ADO integration files used by the conduit repo.
# owner:       HUMAN
# update:      Manual when ADO integration architecture changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# ADO Integration

This repo carries the local orchestration layer for ADO integration.

`conduit-core` is the source of truth for shared ADO field mappings. The local [`field-mappings.yaml`](/C:/Users/nalco/.codex/Conduit/integrations/ado/field-mappings.yaml) file is a temporary mirror kept only because the current structure document requires an orchestration-local mapping artifact.

Operational intent:
- shared schema and field contracts live in `conduit-core`
- `conduit` consumes or mirrors those contracts for local sync behavior
- changes to field mappings should be made in `conduit-core` first, then reflected here
