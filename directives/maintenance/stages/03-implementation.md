<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/maintenance/stages/03-implementation.md
# description: Stage 3 Implementation directive delta for maintenance convoys.
# owner:       HUMAN
# update:      Manual when implementation policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 3. Write a Before/After record for every change** (exact versions, config values, or code patterns + why) in living-spec.md — the audit trail proving the change was intentional and bounded.
- **Surgical scope, same as bug fixes:** only change what's in the declared maintenance scope; log out-of-scope discoveries in the Decisions Log and open a separate convoy.
- Gate 3 blocks on a complete Before/After record and zero out-of-scope changes (unless a scope change was documented and approved).

# Stage 3 — Implementation Directive (Maintenance)

> **Delta from net-new**: See `directives/net-new/stages/03-implementation.md` for the full base directive.
> This file documents only what DIFFERS for maintenance convoys.

## Recommended Model
**claude-sonnet-4-6** standard / **claude-opus-4-6** for security-sensitive code — same as net-new.

## Key Difference: Document Before and After

Maintenance implementation must produce a **Before/After record** for every change. This is the audit trail that proves the change was intentional and bounded.

Add to living-spec.md during implementation:

```
### Before/After Record

#### [Change 1: e.g., "Upgrade express from 4.18.2 to 4.19.2"]
Before: [exact version, config value, or code pattern being replaced]
After:  [exact version, config value, or code pattern now in place]
Why:    [CVE fix / performance improvement / deprecated API removal / etc.]

#### [Change 2: ...]
Before: ...
After:  ...
Why:    ...
```

For TECH_DEBT changes, the "before" is the old pattern and the "after" is the new pattern. The "why" must reference the specific smell or maintenance cost being reduced.

For INFRA changes, document config file diffs or environment variable changes in the before/after.

## Scope Discipline

Maintenance has the same surgical scope rule as bug fixes: **only change what is within the declared maintenance scope**. If you discover something worth fixing or improving outside the scope, log it in the Decisions Log and create a separate convoy.

## Gate 3 Addition (in addition to net-new checklist)

- [ ] Before/After record is written for every changed component/package/file
- [ ] No changes outside the declared maintenance scope (or scope change is documented and approved)
