<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/enhancement/stages/02-solution-design.md
# description: Stage 2 Solution Design directive delta for enhancement convoys.
# owner:       HUMAN
# update:      Manual when design policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 2.** A "Backward Compatibility" section is mandatory — list each preserved behavior and how the design preserves it; state "zero breaking changes" explicitly if true.
- **Prefer additive changes.** Read the current implementation's contracts (API shape, schema, exported types) before designing; any breaking change must name every affected caller, include their remediation in Work Streams, and get Architect sign-off.

# Stage 2 — Solution Design Directive (Enhancement)

> **Delta from net-new**: See `directives/net-new/stages/02-solution-design.md` for the full base directive.
> This file documents only what DIFFERS for enhancement convoys.

## Recommended Model
**claude-sonnet-4-6** standard / **claude-opus-4-6** for auth, PII, schema migrations — same as net-new.

## Key Difference: Backward Compatibility Section Required

Every enhancement solution design MUST include a **Backward Compatibility** section. This is the contractual statement of what existing behavior is guaranteed to continue working.

```
### Backward Compatibility
The following existing behaviors MUST continue to work after this enhancement ships:
- [Behavior 1]: [How the design preserves it]
- [Behavior 2]: [How the design preserves it]

Breaking changes (if any):
- [Behavior]: [Why breaking is acceptable] — requires Architect sign-off
```

If there are zero breaking changes: state that explicitly. Do not leave this section blank.

## Design Constraint for Enhancements

Before proposing how to extend a component, read its current implementation. Identify:
- What contracts (API shape, DB schema, exported types) does this component expose to callers?
- Which callers will be affected if the contract changes?
- Can the enhancement be additive (new fields optional, old endpoints untouched) vs. breaking?

**Prefer additive changes.** If a breaking change is required, document every caller that will break and include their remediation in the Work Streams table.

## Gate 2 Addition (in addition to net-new checklist)

- [ ] Backward Compatibility section is populated with at least one preserve statement
- [ ] Every breaking change (if any) names the affected callers and is flagged for Architect sign-off
