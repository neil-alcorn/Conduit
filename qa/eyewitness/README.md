<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        qa/eyewitness/README.md
# description: Notes on the constrained EyeWitness pattern adapted for CONDUIT visual regression.
# owner:       HUMAN
# update:      Manual when visual regression architecture changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# EyeWitness Integration

CONDUIT adapts only:

- Headless browser invocation.
- Structured screenshot naming and storage.
- HTML and JSON result output consumed by QA Gate evaluation.

CONDUIT does not use EyeWitness network scanning, credential detection, or its reporting UI.
