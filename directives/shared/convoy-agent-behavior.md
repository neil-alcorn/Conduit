<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/convoy-agent-behavior.md
# description: Rules governing AI agent behavior when driving a Conduit convoy.
# owner:       HUMAN
# update:      Manual — approved changes only. Review when Conduit stage model changes.
# schema:      none
# last_update: 2026-06-12
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Applies whenever a convoy is active** (`convoys/active/<id>/` exists).
- **Stop at every gate.** Surface the gate evaluation; never `gate approve` without an explicit human request.
- **Auto-proceed only after a passed gate** — load the next stage directive and continue. Don't wait for "what's next?".
- **After `gate approve`, apply work-tracker state transitions** per §3 (canonical home for the protocol) and record `conduit usage record` on stage advance.
- **Don't commit before gate approval** — the Conduit window commits after the gate passes (§8).

# Convoy Agent Behavior

> **Authoritative reference for:** gate checkpoint rules, convoy mode behavior, work-tracker gate-transition protocol (§3).

## Purpose

Defines how the agent layer (Claude Code, Codex CLI, or any future host) must
behave when driving work under an active convoy. An agent can subtly undermine
the process by completing work and moving on without surfacing required gates —
these rules keep gates real. They apply any time an AI drives a convoy stage.

---

## 0. Convoy Storage — Central Only (CLI-4 / AC-16, AC-24)

All convoy artifacts live in the central conduit repo. The CLI resolves the
central path from `$CONDUIT_HOME`, then `~/.conduit/config.json` — never by
walking up from CWD, never auto-creating a registry in a target repo. On
`ConduitNotInitializedError`, run `conduit init --global <abs-path-to-conduit>`
once per machine. `conduit convoy new` from a target repo records
`metadata.target_repo` (+ path in the config `repos` map); convoys without a
`metadata` block are inferred as `target_repo: conduit`.

---

## 1. Mode Announcement

When a session begins and an active convoy exists in `convoys/active/`, the
agent MUST announce convoy mode at the top of its first substantive response
using the `CONDUIT CONVOY ACTIVE` banner defined in
`agent-operating-instructions.md` §"Mode Boundary" (convoy-id, stage, and the
gate required before the next stage — or "none").

No active convoy → no banner. The absence of the banner is itself the signal:
**standard mode**, not Convoy mode. The distinction must be visible.

---

## 2. Gate Checkpoint Rules

### 2a. When a stage boundary is reached

When the AI believes the current stage is complete (all stories closed, code
committed, tests passing), it MUST STOP and surface the gate requirement before
doing anything else: state that Stage N is complete, that gate approval is
required before Stage N+1, and offer the two options — run
`conduit gate request [convoy-id] [gate-type]` or skip with a reason via
`conduit gate skip` — then ask which the user wants.

### 2b. Default behavior

**If no response is given, or the response is ambiguous: run the gate.**
Do not skip. Do not advance. The default position is to honor the process.

### 2c. Skipping a gate

A skip is a first-class action, not a shortcut. It MUST be explicitly confirmed
by the human, include a stated reason, and be logged via `conduit gate skip`.
The AI must not skip a gate on its own initiative — not to save time, not
because "it's just Phase 0," not because the work seems obviously complete.

### 2d. User-granted auto-proceed

The user may grant permission to proceed through multiple gates without
stopping ("Proceed through all gates", "Auto-approve through Stage 8", etc.).
When granted: run each gate evaluation normally (full checklist); APPROVE →
advance automatically and log; SEND_BACK or ESCALATE → **STOP and surface the
issue** — auto-proceed never overrides failures, it only skips the pause on
clean passes. Show the standard gate output at each boundary and log
`auto_proceed: true` in the gate event. Auto-proceed expires at session end
and must never be assumed.

### 2e. Closing work items (not a gate substitute)

Closing work-tracker stories or features does NOT constitute gate approval. Work items
track implementation completion; gates track quality and process compliance.

### 2f. After gate approval — auto-advance context

When a gate is approved and the convoy advances to Stage N+1, the agent MUST
immediately — without waiting to be asked — show the convoy banner (Stage N+1,
"Gate N passed") followed by three sections: **What was done (Stage N)**
(completed work and artifacts), **What's next (Stage N+1)** (key directive
requirements, artifacts to produce, Gate N+1 criteria), and **Risks & open
questions** (anything needing user input; if none: "No blockers — ready to
proceed."). The user should never have to ask "what's next?" after a gate
passes. Gates are checkpoints, not stop signs.

### 2g. Model usage recording (light tracking)

On stage advance (after `gate approve`, or when auto-proceeding past a clean
evaluation), record which model produced the completed work:

```
conduit usage record --stage <N-just-finished> --model <model-id> [--input N --output N --cache-read N]
```

This appends a `model_usage` event; `conduit usage report` audits recorded
models against directive policy. Token counts optional. Observability, not a
gate — forgetting does not block advancement.

### 2h. Push-back duty at gate evaluation

When the agent observes a standard deviation or risky decision during convoy
work — a scope creep, an unapproved dependency, an implementation that diverges
from the Stage 2 design, a security concern, or any other pattern the gate
evaluator would flag — it MUST surface that observation in the gate evaluation
rather than silently complying or omitting it.

**This is not optional.** Silence at gate time is the failure mode this rule
closes. The gate evaluation is the checkpoint where deviations must be declared,
not buried in commit messages or discovered by the peer reviewer.

When assembling or evaluating a gate request, the agent must ask itself: "Did
anything in this stage deviate from the Stage 2 design? Were any risky decisions
made? Are there patterns here the team should codify via `conduit learn`?" If
the answer to any of these is yes, it must appear in the gate evaluation report
— as a finding, a Decisions Log entry, a learning candidate, or an explicit
acknowledgment — before the gate proceeds.

The duty to surface applies even under user-granted auto-proceed (§2d): a
finding that would cause SEND_BACK or ESCALATE overrides auto-proceed.

---

## 3. Work-Tracker State Transitions

> **Canonical home for the work-tracker gate-transition protocol.** The `conduit-gate`
> skill and the AGENTS.md workflow table point here — edit this section only.

The CLI does **not** auto-apply work-tracker state changes. After every successful
`gate approve`, read `work_items.gate_transitions` in the convoy's `convoy.yaml`
and execute the state changes for the gate that just passed:

- `activate` items → set tracker state to **Active** (or your tracker's equivalent)
- `resolve` items → set tracker state to **Resolved**
- `close_stories` / `close_feature` / `close_epic` → set tracker state to **Closed**

Default mapping when authoring `gate_transitions`:

| Gate passes | What moves | Tracker State |
|---|---|---|
| Gate 0 (Intake) | Epic + Features | **Active** |
| Gate 1 (BA Requirements) | Stories in convoy scope | **Active** |
| Gate 3 (Implementation) | Stories completed in this stage | **Resolved** |
| Gate 8 (Release) | Stories, Features, Epic | **Closed** |
| Gates 2, 4, 5, 6, 7 | — no state change — | — |

**Execution:** use whatever your work tracker exposes — its MCP server when
available, otherwise its CLI or REST API. Map the canonical states above to your
tracker's actual state names.

**Rules:**

1. **Run `conduit sync` before updating** — verify current tracker state first
2. **Only move items listed in `gate_transitions`** — excluded items are never touched
3. **Log every state change** — append to `audit/events.jsonl` with type `work_item_state_change`
4. **Never move backwards** — if an item is already Resolved, don't set it back to Active
5. **Report what moved** in the gate output ("Moved 6 stories to Active in the tracker"); if a gate has no transitions, say "No tracker transitions for this gate." Never silently skip this step.
6. **If a tracker update fails** — log the error, continue with remaining items, report failures

---

## 4. Phase 0 Rule

Phase 0 convoys are Conduit building Conduit — the most important convoys to
gate honestly. **In Phase 0: apply gate rules MORE strictly, not less.** If the
AI finds itself reasoning "it's fine to skip this gate because we're still
figuring out the process" — that is exactly backwards. The gate exists to
surface what the process needs to learn. Run it.

---

## 5. Convoy vs Standard Mode Summary

Convoy Mode: banner at session start; gate required at every stage end; work-item
closure never equals gate passage; skips only with explicit confirmation +
reason; audit trail (gate-log.jsonl) required. Standard Mode: none of these.

---

## 6. Agentic Capability Selection

Capability requirements (worktree isolation, parallel agents, host-specific
invocation, the 4-agent limit) live in `agent-operating-instructions.md`
§"Agentic Execution" and `parallel-dispatch.md` — not restated here.
Convoy-specific additions:

- **Worktrees are REQUIRED for:** any Stage 3 change touching 3+ files;
  Stage 2 spikes that may be discarded; any change to auth, schema migrations,
  or security-sensitive code; multi-workstream convoys sharing a repo. In a
  two-window setup, the Conduit window owns master — Stage 3 work happens in a
  worktree, never the main checkout.
- **`conduit sync` MUST run before:** any gate evaluation that depends on
  work-tracker state; any work-tracker state transition (§3); reporting convoy
  status to the user.
- **`conduit qa`** — use at Stage 6 when Playwright is installed
  (`conduit qa status` confirms) or visual-regression baselines are needed.

---

## 7. Infer First, Fix Automatically, Report What You Did

Resolve ambiguity from context rather than asking — stopping to ask questions
inferable from the work itself defeats the purpose.

### 7a. Work type inference

If `work_type` is missing, non-standard, or ambiguous, infer the standard type
from the living spec, the tracker Epic description, or workstream acceptance criteria:
doesn't exist yet → `net-new`; extends existing capability → `enhancement`;
fixes a defect/regression → `bug-fix`; deps/refactoring/infra → `maintenance`.
Update `convoy.yaml` and report the inference. Do not ask.

### 7b. Schema mismatches

If convoy field naming doesn't match the directive schema but the data is
complete and unambiguous, restructure to match the schema. Report. Do not ask.

### 7c. Stage-appropriate content

If content belongs to a later stage (e.g., solution design in Stage 0), do not
block or ask for removal — note it for the gate evaluator. The gate decides.

### 7d. Scope of "infer first" — what it does NOT cover

7a–7c apply ONLY to convoy.yaml field values, schema restructuring, and
flagging stage content. They do **NOT** apply to:

- **Gate approvals/rejections** — ALWAYS explicit human confirmation (§2)
- **Gate skips** — ALWAYS explicit confirmation + reason (§2c)
- **Closing a convoy** — irreversible
- **Work-tracker state transitions** — only after gate approval, never preemptively
- **Advancing to the next stage** — only after gate approval

**The agent must never auto-approve a gate.** Even if every checklist item
passes, surface the recommendation and wait. Gates are human decisions. Period.

### 7e. When to ask

Ask when: any gate decision (always); interpretations are equally valid with no
tie-breaking signal; consequences are irreversible; or required information is
genuinely missing (not inferable from any artifact).

---

## 8. Commit Authority by Stage

In a two-window setup (Code window + Conduit window), commit authority is
explicit to protect the audit trail. **Stages 0–7:** the Code window produces
artifacts (Stage 3 in a worktree); the **Conduit window commits them after
gate approval**, so every commit traces to a gate decision. **Stage 8:** the
Conduit window does both — execution and commits (deploy, tag, close).
Unauthorized commits (before gate approval, or from the wrong window) break
the audit trail — flag immediately if it happens.

---

## 9. What This Directive Does NOT Cover

- What the gate evaluator checks (`gate-evaluator.md`); how approvals are
  recorded (`cli/src/commands/gate.ts`); stage-specific gate criteria
  (`directives/{work_type}/stages/`).

This directive covers only **agent behavior at the process boundary** — when to
stop, ask, and wait for human confirmation before moving on.
