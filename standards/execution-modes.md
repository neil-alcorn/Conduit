<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/execution-modes.md
# description: Defines Conduit's two execution modes: DETERMINISTIC and AGENTIC.
#              Core design principle. Every stage and step is labeled with its mode.
# owner:       HUMAN
# update:      Manual when stage responsibilities change.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Every Conduit action is labeled DETERMINISTIC or AGENTIC** — the backbone of trust and reproducibility.
- **DETERMINISTIC** (commits, convoy.yaml, events, release checklists): execute exactly as written; anything missing or unexpected → STOP and report — never infer, fix, add, or skip.
- **AGENTIC** (implementation, requirements, design, security, QA analysis): use judgment, show reasoning, propose rather than impose — but never make human-owned decisions (gates, scope, risk).
- Stage 8 fully DETERMINISTIC; 0–2, 5, 7 AGENTIC; 3, 4, 6 mixed with per-step labels.

# Conduit Execution Modes

## The Core Principle

Every action in Conduit is either **DETERMINISTIC** or **AGENTIC**. This is not a style preference —
it is the structural backbone of how Conduit maintains trust and reproducibility.

An agent that guesses when it should follow orders is dangerous. An agent that follows orders when it
should be thinking produces mediocre work. Conduit labels which mode applies so there is never ambiguity.

---

## DETERMINISTIC

> "Follow the order exactly. Do not interpret. Do not improve. Do not guess."

The agent executes a defined sequence of steps. The output is fully specified by the inputs and the
instructions. If something unexpected occurs, the agent **stops and surfaces it** — it does not adapt
or problem-solve.

**When to use:**
- Committing and pushing (exact files, exact message format)
- Updating convoy.yaml (known field values, known schema)
- Writing events.jsonl entries (fixed schema)
- Running a test suite and reporting results (run → capture → report, no interpretation)
- Applying work-tracker state changes from a pre-reviewed stage-local script
- Release checklists (checkbox by checkbox)

**Rules for DETERMINISTIC steps:**
1. Execute the step as written. No shortcuts.
2. If a value is missing or ambiguous, **stop** — ask the human. Do not infer.
3. Do not add steps not listed. Do not skip steps.
4. If the step produces an unexpected result, **stop and report** the exact output. Do not attempt to fix.
5. Confirm completion explicitly (e.g., "Done. convoy.yaml updated. Stage is now 6.").

**Label in directives:** Steps marked `[DETERMINISTIC]` follow these rules.

---

## AGENTIC

> "Find the best solution. Use judgment. Propose. Explain your reasoning."

The agent applies expertise to achieve a goal. The path is not fully prescribed. The agent can
choose approaches, surface trade-offs, propose alternatives, and push back on bad ideas.

**When to use:**
- Implementation (how to structure a component, which pattern to apply)
- BA requirements (what the ACs should say, what edge cases to consider)
- Solution design (architecture decisions, tech choices)
- Security analysis (what constitutes a risk, severity assessment)
- QA coverage assessment (what's actually covered, what gaps exist)
- Interpreting ambiguous user feedback

**Rules for AGENTIC steps:**
1. Pursue the best outcome, not the literal instruction. If the literal instruction leads somewhere bad, say so.
2. Show your reasoning for non-obvious choices.
3. Flag trade-offs. The human decides; the agent informs.
4. Do not make decisions that belong to the human (gate approval, scope changes, security acceptance).
5. Propose, don't impose. "I'd recommend X because Y — do you want to proceed?" beats silently choosing X.

**Label in directives:** Steps marked `[AGENTIC]` follow these rules.

---

## Stage Mode Map

Each stage has a dominant mode. Some stages mix both.

| Stage | Name | Mode | Rationale |
|---|---|---|---|
| 0 | Intake | AGENTIC | Classification requires judgment about scope and risk |
| 1 | BA Requirements | AGENTIC | ACs are authored, not generated from a template |
| 2 | Solution Design | AGENTIC | Architecture decisions are judgment calls |
| 3 | Implementation | AGENTIC + DETERMINISTIC | Implementation is agentic; commit/file-write steps are deterministic |
| 4 | QA Unit | AGENTIC + DETERMINISTIC | Coverage analysis is agentic; test execution and result reporting are deterministic |
| 5 | QA Security | AGENTIC | Threat modeling and severity assessment require judgment |
| 6 | QA Regression | DETERMINISTIC + AGENTIC | Smoke test execution is deterministic; regression analysis is agentic |
| 7 | Business Comms | AGENTIC | Writing is judgment |
| 8 | Release | DETERMINISTIC | Release is a checklist. No improvisation. |

---

## Mixed Stages

When a stage contains both modes, steps are individually labeled. Example from Stage 4:

```
[DETERMINISTIC] Run npm run test. Record: total, passing, failing, skipped. 
Do not proceed if any test fails — stop and report.

[AGENTIC] Analyze criterion coverage. Identify gaps. For each uncovered criterion, 
determine whether the behavior is implemented but untested (write the test) or 
not implemented at all (flag as implementation gap).
```

---

## Why This Matters

Without mode labels, agents drift. A DETERMINISTIC step gets "improved" in a way that
breaks reproducibility. An AGENTIC step gets rigidly followed when the situation called
for judgment. Both failure modes erode trust.

Conduit's value comes from being predictable where predictability matters and intelligent
where intelligence matters. The label is how you tell the difference.
