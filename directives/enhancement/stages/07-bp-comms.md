<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/enhancement/stages/07-bp-comms.md
# description: Stage 7 BP Comms directive delta for enhancement convoys.
# owner:       HUMAN
# update:      Manual when comms policy changes.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Delta on net-new Stage 7. No commit/push** — draft comms, report, wait for the gate.
- **Release notes must separate "What changed" from "What stayed the same"** — omitting the latter generates user confusion and support tickets. Gate 7 criteria unchanged from net-new.

# Stage 7 — Business Comms Directive (Enhancement)

## ⛔ COMMIT DISCIPLINE

**Do NOT commit or push.** Draft the comms, report the draft to the human, wait for gate approval. The Conduit window commits after approval. This applies even though Stage 7 feels like "just writing."

> **Delta from net-new**: See `directives/net-new/stages/07-bp-comms.md` for the full base directive.
> This file documents only what DIFFERS for enhancement convoys.

## Recommended Model
**claude-haiku-4-5** / **claude-sonnet-4-6** for significant external-facing impact — same as net-new.

## Key Difference: "What Changed" Framing

Enhancement release notes must include a "What Changed" section distinct from "What's New." Users who relied on the existing behavior need to understand what is the same vs. what is different.

```
## [Feature Name] Enhancement — Released [Date]

**What changed:** [What the existing feature now does differently.]

**What stayed the same:** [Existing workflows that are unaffected — reassure users.]

**Who is affected:** [Which users. Which workflows.]

**What to do:** [If user action required. If none, say so explicitly.]
```

Omitting "What stayed the same" is a common source of user confusion and unnecessary support tickets. Name it.

## Gate 7 — No Changes

Same as net-new. The base directive is the full requirement.
