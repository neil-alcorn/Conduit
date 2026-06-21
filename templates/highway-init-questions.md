<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        templates/highway-init-questions.md
# description: One-time questionnaire for Highway Init. Answered once per repo; answers become CONDUIT.md.
# owner:       HUMAN
# update:      Manual when new signals are added to the highway schema.
# schema:      none
# last_update: 2026-04-09
# ─────────────────────────────────────────────────────────────────────
-->

# Highway Init — One-Time Questions

When running `conduit highway init [repo-path]`, the agent asks these questions **once** and writes the answers into `CONDUIT.md`. Answers are never re-asked unless the human explicitly edits CONDUIT.md.

The goal: capture the things an agent cannot infer from reading the code — ownership, scope constraints, and forbidden patterns.

---

## Questions (asked by agent, answered by human)

### Identity

1. **What is this repo's primary purpose?**
   (One sentence. Will appear in the Status section of CONDUIT.md.)
   _Example: "SvelteKit platform app — the unified employee dashboard."_

2. **Is this repo actively developed, a source reference, a POC, or infrastructure?**
   Options: `active-app` | `active-tool` | `shared-library` | `source-reference` | `poc` | `infrastructure` | `unstarted` | `archived` | `test`

3. **What is the tech stack?**
   (Framework + DB + auth + hosting. One line.)
   _Example: "SvelteKit 2 + Drizzle ORM + PostgreSQL + OIDC auth + managed app hosting"_

4. **Is there a live URL?**

5. **Which work tracker, if any, does this repo use, and is there an epic or work item it maps to?**

### Ownership

6. **Who owns this repo?** (Name or team)

7. **Who must approve changes to infrastructure or pipelines in this repo?**

### Agent Rules

8. **What should agents NEVER do in this repo?**
   (Examples: modify hooks.server.ts auth, run terraform apply, push to main without review)

9. **Are there any files or directories agents should never touch?**
   (Examples: infra/, .env files, migration files that have already run)

10. **Are there patterns from other repos that DO NOT apply here?**
    (Examples: "this repo uses SQLite not PostgreSQL", "no SSO auth — it's public")

### Integration

11. **Does this repo consume or produce data that other repos depend on?**
    (Examples: "the dashboard imports schema types from conduit-core", "this service reads the work tracker API only")

12. **Who are this repo's primary audiences?**
    (Examples: internal employees, end customers, partner systems)

---

## How Answers Become CONDUIT.md

The agent uses answers to populate:

```yaml
# From Q1 → Status line
# From Q2 → repo_type signal
# From Q3 → tech_stack signal
# From Q4 → live_url signal
# From Q5 → work_tracker_project / work_item signal
# From Q6 → team signal
# From Q7-Q9 → "What Agents Must NOT Do" section
# From Q10 → Key Conventions or Architecture Notes section
# From Q11 → Relationship notes
# From Q12 → Primary Audiences section
```

---

## Rules for Highway Init

- Ask all 12 questions **before** writing any file
- Write CONDUIT.md only after all answers are collected
- Do NOT infer answers from code — ask the human
- Do NOT re-ask questions that are already in an existing CONDUIT.md
- If the human says "I don't know" on a non-critical question, use a sensible default and flag it as `# TODO: confirm`
- After writing CONDUIT.md, also write a stub `CONTEXT.md` and `QA/ACCEPTANCE.md` using the answers
- Register the repo in `conduit/highway-index/repos/[slug].yaml` and update `highway-index/index.yaml`
