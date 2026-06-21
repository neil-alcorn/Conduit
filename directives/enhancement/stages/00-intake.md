<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/enhancement/stages/00-intake.md
# description: Stage 0 Intake directive delta for enhancement convoys.
# owner:       HUMAN
# update:      Manual when intake policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 0.** Verify this EXTENDS an existing implementation — rewrite = maintenance/net-new, absent capability = net-new; reclassify `work_type` if wrong.
- **Add an "Existing Behavior" subsection** to living-spec.md Intent before drafting criteria — required, prevents gold-plating and accidental breakage.
- Convoys live in the central conduit repo only; check no hidden removal of existing behavior inside the enhancement scope.

# Stage 0 — Intake Directive (Enhancement)

> **Delta from net-new**: See `directives/net-new/stages/00-intake.md` for the full base directive.
> This file documents only what DIFFERS for enhancement convoys.

## Convoy storage — central only (CLI-4 / AC-24)

Convoys live in the central conduit repo, never in target repos. `conduit convoy new`
captures the target repo's identity in `convoy.yaml` `metadata.target_repo` /
`metadata.target_repo_path` so source-code commits land in the right place.
See `directives/shared/convoy-agent-behavior.md` §0 for the full resolution rule.

## Recommended Model
**claude-sonnet-4-6** — Intake classification is a judgment task requiring business context understanding, not simple pattern matching. Haiku is insufficient for scope classification and risk assessment.

## Key Difference: Classification Focus

Step 3 of the net-new directive says "confirm net-new classification." For enhancement convoys, the equivalent check is the inverse: **explicitly verify this is EXTENDING existing capability, not REPLACING it and not adding something that does not exist at all.**

Classification test for enhancement:
- Does a working implementation already exist? → Enhancement confirmed
- Is the request adding to that implementation? → Enhancement confirmed
- Is the existing implementation being removed and rewritten? → This may be maintenance (tech debt) or net-new, not enhancement — reclassify
- Is the requested capability entirely absent from the codebase? → Net-new, not enhancement — reclassify

If misclassified: update `work_type` in convoy.yaml and re-route to the correct directive.

## Additional Step: Document What Already Exists

Before drafting acceptance criteria, add an **Existing Behavior** subsection to the living-spec.md Intent:

```
Existing Behavior:
- [What the feature currently does, in user-visible terms]
- [Which users are currently affected and how]
- [Known limitations that this enhancement addresses]
```

This is required. Enhancement requests that arrive without documenting current behavior routinely gold-plate or accidentally break what already works.

## Gate 0 Additions (in addition to net-new checklist)

- [ ] Enhancement classification is confirmed — existing implementation is documented
- [ ] "Existing Behavior" section is written in living-spec.md
- [ ] No request to REMOVE existing behavior is hidden inside the enhancement scope
- [ ] Work tracker child audit complete — every child of the convoy's parent item is in `gate_transitions` or `excluded` (inherited from net-new Step 5; skip if not using a tracker)
