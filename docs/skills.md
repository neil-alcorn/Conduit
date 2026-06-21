<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/skills.md
# description: Conduit's skill system — what skills are, how they are created,
#              distributed, and managed across the platform.
# owner:       HUMAN
# update:      When skills are added, changed, or retired.
# schema:      none
# last_update: 2026-04-18
# ─────────────────────────────────────────────────────────────────────
-->

# Claude Skills in Conduit

## What is a Skill

A **Skill** is a reusable, named prompt file (`.md`) with a YAML frontmatter header that Claude Code
recognizes as an invokable command. Skills are stored in `.claude/skills/` and invoked via `/skill-name`
in a Claude session.

```yaml
---
name: my-skill
description: What this skill does — shown in /help
allowed-tools: Bash, Read, Glob, Grep
---
[prompt content]
```

Skills are Claude's equivalent of a shell alias + runbook combined. They encode a repeatable
multi-step process so a developer doesn't have to remember or re-explain it each session.

---

## How Skills Fit into Conduit

Conduit uses **stages and directives** for structured, gated delivery. Skills are different:

| | Directives | Skills |
|---|---|---|
| **Purpose** | Full-stage workflow with gate approval | Repeatable single-task automation |
| **Human gate?** | Yes — every stage | No — autonomous by design |
| **Scope** | Convoy-wide, cross-repo | Narrow, specific task |
| **State tracking** | convoy.yaml, events.jsonl | Synced to the optional registry, approval history tracked |
| **When to use** | New features, enhancements, QA, release | Work-item triage, PR cleanup, branch setup |

**Skills complement Conduit** — they handle the mechanical, repetitive steps that happen *around*
convoy work (board hygiene, branch creation, PR management) so the convoy directives can focus
on the substantive delivery.

---

## Bundled Skills

Conduit ships with bundled skills in `.claude/skills/`. These are committed to the repo and
synced to detected Claude/Codex skill homes by `conduit context`.

| Skill | Description |
|---|---|
| `conduit-behaviors` | View or change behavior policies configured in `behaviors.yaml`. |
| `conduit-brainstorm` | Run intent-before-implementation brainstorming before planning or coding. |
| `conduit-context` | Load the operating picture. Auto-pulls the repo, runs `conduit context`, and displays convoy state. Use at session start. |
| `conduit-convoy` | Manage convoy lifecycle — create new convoys, close completed ones, pause and resume active work. |
| `conduit-debug` | Use the scientific debugging protocol for defects and unexpected behavior. |
| `conduit-execute` | Run wave-based autonomous execution after plan approval. |
| `conduit-gate` | Manage gates — evaluate, approve, reject, or skip. Checks work-item state transitions after approval. |
| `conduit-learn` | Propose a skill or rule as a draft for reviewer approval. |
| `conduit-peer-approve` | Generate a peer prompt for four-eyes gate approval. |
| `conduit-plan` | Initialize, show, and approve spec-driven plans. |
| `conduit-pre-gate` | Run pre-gate verification before requesting a gate decision. |
| `conduit-qa` | Run QA automation workflows such as visual, e2e, accessibility, and status checks. |
| `conduit-review` | Produce code review findings or process inbound review feedback. |
| `conduit-rules` | Sync, list, and install approved Conduit rules. |
| `conduit-session` | Save, resume, and list session handoffs for context continuity. |
| `conduit-skill` | Create, list, validate, and sync skills. Request reviewer approval via the optional registry. |
| `conduit-status` | Check current status — active convoys, stage, gates, and checkpoints. |

Each skill has a `SKILL.md` file with YAML frontmatter (`name`, `description`, `allowed-tools`) and
prompt content that tells the active agent host how to execute the operation.

---

## Skill Lifecycle

### 1. Create

```bash
conduit skill create --name "my-skill" --description "what it does" [--scope shared|personal] [--with-evals]
```

Scaffolds a new skill file with Conduit's security rules baked in. The `--with-evals` flag also
creates an `evals/` directory with test case templates for grading skill quality.

- Skill names must be lowercase alphanumeric with hyphens (e.g., `my-skill-name`)
- The name is run through the sanitizer before creation
- Personal skills go to `.claude/skills/`, shared skills go to `skills/shared/`

### 2. Validate

```bash
conduit skill validate [--name "my-skill"]
```

Checks skill files for security compliance:

- YAML frontmatter present with a `description` field
- Scope section with explicit boundary definition
- No hardcoded credentials (passwords, secrets, tokens, keys)
- No hardcoded user paths (e.g., `C:\Users\someone`)
- No unresolved `TODO` placeholders

Run without `--name` to validate all skills at once.

### 3. Sync

```bash
conduit skill sync
```

Pushes all local skills (both personal and shared) to the optional registry.
Each skill's name, description, scope, content, owner email, and repo slug are sent. The registry
upserts by unique skill name — existing skills are updated, new ones are created.

Requires `CONDUIT_REGISTRY_URL` and `CONDUIT_REGISTRY_API_KEY` environment variables (or equivalent
entries in `.conduit/config.yaml` under the `registry` section). The registry is optional — skip
this if you are running Conduit purely locally.

### 4. Request Review

```bash
conduit skill request-review --name "my-skill"
```

Submits a skill for reviewer approval in the optional registry. Sets the skill's status to
`pending_review` and syncs its content. Approval happens in the registry UI, not the CLI.

### 5. Approve or Reject

Reviewers review pending skills in the registry UI. Each review action
(approve or reject) is recorded in the `skill_approvals` table with the reviewer's email,
action, reason, and timestamp. This provides a full audit trail.

### 6. Install

```bash
conduit skill install
```

Pulls all approved skills from the optional registry and writes
them to the active host skill home (`~/.claude/skills/` or `~/.codex/skills/`) on the developer's machine. Each skill gets its own directory
with a `SKILL.md` file containing frontmatter and content.

### 7. Auto-Install

If `behaviors.context.auto_install_skills` is `true` (the default), bundled `conduit-*`
launcher skills are synced to detected Claude/Codex skill homes every time `conduit context`
runs, and (when a registry is configured) approved registry skills are installed into the active
host skill home. This means developers get approved skills without having to remember to run
`conduit skill install` manually.

---

## Where Skills Are Stored

| Location | Purpose | Persistence |
|---|---|---|
| `.claude/skills/` in the Conduit repo | Bundled skills — committed, shared with all developers | Git-tracked |
| `~/.claude/skills/` or `~/.codex/skills/` on developer machine | Personal and installed skills — local to the developer | Local, gitignored |
| `conduit_skills` table in the optional registry DB | Skills registry — synced via `conduit skill sync` | PostgreSQL |

The flow is: create locally, sync to the registry, get reviewed, then install from the registry to
other developers' machines. (The registry is optional — for purely local use, only the first two
rows apply.)

---

## Security Considerations

Skills that run autonomously (no confirmation gates) carry real risk:

- **Work-tracker writes:** moving cards, creating stories, closing tasks — all irreversible or hard to undo
- **Git operations:** branch creation, commits, pushes — public and permanent once pushed
- **PR actions:** resolving comments, pushing code — visible to reviewers immediately

**Conduit's security rules for skills (enforced):**

1. **Sanitizer enforcement** — skill names and content are run through `sanitize()` during creation.
   The sanitizer blocks injection patterns, disallowed characters, and other security violations.
2. **Approval required by default** — `behaviors.yaml` sets `skills.require_approval: true`.
   Only skills approved by a reviewer in the registry can be distributed via `conduit skill install`.
3. **Scope must be explicitly bounded** — a skill operating on "active stories" must not touch
   stories it didn't create or that belong to other team members.
4. **Credentials from environment only** — PATs, tokens, and secrets must come from environment
   variables or the vault. The `validate` command flags hardcoded credentials.
5. **Audit trail** — every approval and rejection is recorded in the `skill_approvals` table
   (reviewer email, action, reason, timestamp), linked to the skill via foreign key.
