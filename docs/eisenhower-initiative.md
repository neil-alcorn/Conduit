<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/eisenhower-initiative.md
# description: Guide for completing Highway Init and bringing repos onto the CONDUIT network.
# owner:       HUMAN
# update:      Manual when Highway Init policy changes.
# schema:      none
# last_update: 2026-06-18
# ─────────────────────────────────────────────────────────────────────
-->

# Repo Onboarding (Highway Init)

Highway Init is how `conduit init` registers any repo — a personal project or
one of many in an organization — onto your Conduit network. Once a repo is
initialized, agents and developers share a consistent, auditable picture of what
the repo is, what may happen in it, and who to escalate to.

## What `conduit init` Sets Up

1. **Registers the repo** in `highway-index/` so it is discoverable on the network.
2. **Generates `CONDUIT.md`** — the repo's highway document: repo signals, the
   rules of what agents may and must not do, and escalation contacts.
3. **Generates `CONTEXT.md`** — a living architecture summary (module map, data
   flow, schema, known failure modes). The scaffold ships full of TODOs; an
   agent enriches it with `conduit init <repo> --enrich`.
4. **Sets Repo Signals** — `operational_status`, `system_class`, content signals,
   escalation contacts, and context-freshness thresholds.
5. **Links the acceptance criteria registry** (`QA/ACCEPTANCE.md`) used by QA and
   gate evaluation.

A repo can start in `QUARANTINE` and only be cleared once validation succeeds.

## Repo Signals at a Glance

- `operational_status` — `ACTIVE` / `READ-ONLY` / `OBSERVE` / `QUARANTINE`;
  controls what agents are permitted to do.
- `system_class` — e.g. `MODERN`, `LEGACY`, `MAINFRAME`; informs how cautious
  agents should be.
- `escalation_contacts` — owner / architect / security / compliance / specialist.
- `content_signals` — whether the repo's content may be used as AI input, modified
  by AI, or used for training.

See `highways/repo-signals.schema.yaml` for the full schema and
`highways/examples/` for sample CONDUIT.md files across system classes.

## Prioritization

When deciding which repos to onboard first, prioritize by impact:

1. Highest user- or business-impact repos.
2. Actively developed repos.
3. Maintenance-only repos.
4. Archived or inactive systems.

## Prioritization Matrix

Conduit ships a first-class Eisenhower prioritization system built on top of
**initiatives** — named tracks of work that carry urgency and importance scores.
The `conduit matrix` command renders a live quadrant view from your active
initiatives.

### Managing Initiatives

Create an initiative:

```
conduit initiative new --title "Migrate auth layer" [--urgency high|low] [--importance high|low]
```

`--urgency` and `--importance` default to `low` if omitted. The initiative
starts with `status: active`.

List all initiatives with their quadrant and status:

```
conduit initiative list
```

Update urgency, importance, or status on an existing initiative:

```
conduit initiative set <id> [--urgency high|low] [--importance high|low] [--status active|done]
```

Only the flags you provide are changed; omitted fields are left as-is.

### The Eisenhower Matrix (`conduit matrix`)

Running `conduit matrix` renders all **active** initiatives grouped into the
four classic quadrants:

| Quadrant | Urgency | Importance | Action |
|---|---|---|---|
| **DO NOW** | high | high | Work on these immediately. |
| **SCHEDULE** | low | high | Block time — don't let them slip. |
| **DELEGATE** | high | low | Handle, but don't own the outcome. |
| **DELETE / DEFER** | low | low | Drop or move to a long-term backlog. |

The output also highlights a **Next:** item — the top entry from the DO NOW
quadrant — so you always know the single highest-priority thing to act on.

### Linking an Initiative to a Convoy

When you start a new convoy you can associate it with an initiative:

```
conduit convoy new --title "..." --initiative <id>
```

The initiative ID is stored as `initiative_id` in the convoy's `convoy.yaml`.
This lets you group related convoys under a single strategic track and filter
by initiative when reviewing delivery history.

### Storage and Schema

- Initiatives are stored in `initiatives/registry.yaml` at the repo root.
- The JSON Schema for a single initiative is at
  `convoys/schema/initiative.schema.json`.
