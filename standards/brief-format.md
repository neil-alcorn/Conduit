<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/brief-format.md
# description: Required format for all convoy brief.md files. The Conduit window
#              must follow this template when generating or regenerating a brief.
# owner:       HUMAN
# update:      Manual when brief policy changes. Applies to all generated briefs.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **The Conduit window regenerates `brief.md` after every gate approval** — the brief IS the next session's startup prompt.
- **Required sections in order:** header, how-to-use boilerplate, ⛔ COMMIT AUTHORITY block (verbatim, every brief), state block, critical decisions, next agent action, footer.
- **Never omit the commit authority block** — last line of defense against pre-approval commits. Agent works → human approves → Conduit window commits.

# Convoy Brief Format Standard

The Conduit window regenerates `convoys/active/[convoy-id]/brief.md` after every gate approval.
This standard defines what every brief MUST contain.

---

## Required Sections (in order)

### 1. Header block

```markdown
# Convoy Brief: [convoy-id]

> **Generated at:** Gate N approved YYYY-MM-DD
> **This file IS the startup prompt.** Paste its contents into a new agent session. The agent reads it, confirms what it's about to do, and waits for "proceed."
```

### 2. How to use (unchanged boilerplate — do not modify)

```markdown
## How to use this brief

**Starting a new session:** Paste this file's contents as your opening message. Agent confirms its plan, you say **"Proceed"**.
**Approving a gate mid-session:** Say **"Gate N approved"** — no re-paste needed.
**After gate approval:** The Conduit window updates and regenerates this file. Paste the new version to start Stage N+1.
```

### 3. ⛔ COMMIT AUTHORITY block — REQUIRED IN EVERY BRIEF

This block MUST appear verbatim in every brief, regardless of stage:

```markdown
## ⛔ COMMIT AUTHORITY

**You are NOT authorized to run `git commit` or `git push` in any repo.**

The Conduit window is the only authorized committer in a managed convoy. Your job is to do the work and report the results. The human approves the gate, then the Conduit window commits and pushes. If you find yourself typing a git commit or push command, stop — you are violating this convoy's commit discipline.

This applies to ALL repos touched in this stage.
```

### 4. State block (stage, status, what's built, what's left)

```markdown
**Stage:** N — [Stage Name]
**Status:** active | **Repo:** [repo] | **Work type:** [type]

**What's built:** [concise summary, ≤ 2 sentences]

**What's left:** [next stage summary. ws-[name] pending items if any]

**Open ACs:** [None OR list of open ACs with IDs]

**Gate conditions:** [None OR conditions inherited from previous gate]
```

### 5. Critical decisions (abbreviated list from decisions log)

```markdown
**Critical decisions:**
- [Decision] — [one-line rationale]
```

### 6. Next agent action (specific, actionable)

```markdown
**Next agent action:** [Specific instruction. Which directive to load. What to produce.]
```

### 7. Footer reference

```markdown
---
*Full context: `living-spec.md` | `CONDUIT.md` | `CONTEXT.md` | `QA/ACCEPTANCE.md` (and any other relevant files)*
```

---

## Commit Authority Block — Why It Exists

Agents have repeatedly committed to repos before gate approval across multiple convoy stages, even when the directive contained explicit "do not commit" language. The commit authority block in the brief is the last line of defense — it appears before any stage directive is loaded, in the agent's first input of the session.

The rule: **The agent produces work. The human approves. The Conduit window commits.** This is the authority chain. It does not change based on stage, work type, or whether the commit "seems like a good idea."

---

## When the Conduit Window Regenerates the Brief

Trigger: immediately after recording gate approval in `convoy.yaml` and `gate_history`.

Steps:
1. Read current `convoy.yaml` (stage, status, gate_history)
2. Read current `living-spec.md` (What Was Actually Built if populated, Decisions Log tail)
3. Read current `brief.md` (carry forward Critical Decisions, update for new stage)
4. Write new brief following this format
5. Commit brief.md with message: `[convoy-id]: Gate N approved, advance to Stage N+1 — regenerate brief`
