<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        highways/ACCEPTANCE-md.template.md
# description: Template for per-repo QA acceptance criteria registries.
# owner:       BOTH
# update:      Updated by QA Agent when new verified failure modes are added.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# ACCEPTANCE: {{REPO_NAME}}

## Criteria Registry

| ID | Criterion | Type | Status | Notes |
|----|-----------|------|--------|-------|
| AC-001 | {{CRITERION}} | functional | active | {{NOTES}} |

## Test Case Mapping

| Criterion ID | Test Case | Stage | Owner |
|--------------|-----------|-------|-------|
| AC-001 | {{TEST_CASE}} | 4 | qa |

## Visual Baseline Targets

| Target | Baseline Path | Comparison Rule |
|--------|---------------|-----------------|
| {{TARGET}} | {{BASELINE_PATH}} | pixel-threshold |
