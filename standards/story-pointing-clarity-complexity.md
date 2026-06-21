<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/story-pointing-clarity-complexity.md
# description: Optional Clarity × Complexity story-pointing standard. Repos opt in via CONDUIT.md. Teams that do not opt in are unaffected.
# owner:       BOTH
# update:      When the matrix, opt-in signal, or write-back target changes.
# schema:      none
# last_update: 2026-05-27
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- Opt-in only — repos adopt this standard by adding `pointing_standard: clarity-complexity` to their `CONDUIT.md` Repo Signal block.
- Score each Feature on two dimensions: Clarity (1–3) and Complexity (1–3). Map to Fibonacci-adjacent points using the matrix below.
- Clarity = 3 triggers an informational warning before estimating; estimation is not blocked.
- Write the point value to your tracker's story-points field on the Feature.
- This standard does not override a repo's existing pointing practice if `pointing_standard` is absent or set to something else.

# Clarity × Complexity Story-Pointing Standard

## Opt-In

This standard is **opt-in per repo**. To adopt it, add the following line to your repo's `CONDUIT.md` Repo Signal block:

```yaml
pointing_standard: clarity-complexity
```

Agents reading `CONDUIT.md` at Stage 1 detect this signal as plain text and apply the standard when asked to estimate. If the signal is absent, the agent skips estimation and defers to whatever pointing practice the repo's `CONDUIT.md` describes (or skips estimation entirely if none is documented).

---

## Scoring

### Clarity — how well-defined are the requirements?

| Score | Label | Description |
|-------|-------|-------------|
| 1 | Clear | Requirements are specific and complete. Acceptance criteria can be written immediately. |
| 2 | Mostly Clear | Core requirements are understood; some edge cases or dependencies are still open. |
| 3 | Ambiguous | Requirements are vague, conflicting, or heavily dependent on decisions not yet made. |

### Complexity — how technically complex is the implementation?

| Score | Label | Description |
|-------|-------|-------------|
| 1 | Simple | Familiar pattern. One system involved. Straightforward to implement without significant research. |
| 2 | Moderate | Some new ground. May touch multiple systems, require a non-trivial integration, or involve a pattern the team has not used before. |
| 3 | Complex | Novel approach, cross-system coordination, security-sensitive code, or significant unknowns in the implementation path. |

---

## Point Matrix

Point values use a Fibonacci-adjacent scale (1, 2, 3, 5, 8) that reflects how uncertainty compounds when both clarity and complexity are high.

|  | **Complexity 1** (Simple) | **Complexity 2** (Moderate) | **Complexity 3** (Complex) |
|---|---|---|---|
| **Clarity 1** (Clear) | **1** | **2** | **3** |
| **Clarity 2** (Mostly Clear) | **2** | **3** | **5** |
| **Clarity 3** (Ambiguous) | **3** | **5** | **8** |

**Reading the table:** A Feature that is well-understood (Clarity 1) and technically straightforward (Complexity 1) is 1 point. A Feature that is ambiguous *and* technically novel (Clarity 3, Complexity 3) is 8 points — a signal that it may need to be broken down or de-risked before committing to a sprint.

---

## Clarity = 3 Warning

When a Feature scores Clarity = 3 (Ambiguous), the agent must surface this warning **before** writing the point value:

> *"Clarity = 3 suggests this Feature may not be sufficiently defined. Consider running the BA brain-dump flow (`directives/shared/ba-brain-dump.md`) before finalizing estimation. Estimating ambiguous work often leads to replanning mid-sprint."*

The warning is **informational** — estimation is not blocked. If the BA or owner wants to proceed, the agent writes the point value to the work tracker.

---

## Write-Back

On confirmation, write the derived point value to your tracker's story-points field on the Feature work item.

Use your tracker's API or integration to update the work item — avoid long-lived personal access tokens; prefer the OAuth/short-lived credential flow your tracker supports.

Points may be revised during a convoy if requirements change. When revising, log the reason in the convoy's Decisions Log.

---

## What This Standard Does Not Do

- **Does not override local practice.** If a repo has its own pointing standard in `CONDUIT.md` and has NOT opted in to `clarity-complexity`, those local rules stand.
- **Does not lock points.** Points can be revised with reason logged in the Decisions Log. The "points never change" rule from sdlc-cli-idea was explicitly rejected.
- **Does not apply to Stories.** The unit of estimation in this standard is the **Feature**. Story-level pointing is out of scope.
- **Does not generate acceptance criteria.** Estimation is a separate step from requirements. A point value does not substitute for Given/When/Then AC.
