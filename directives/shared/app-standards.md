<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/app-standards.md
# description: Table-stakes requirements for all user-facing web apps.
#              Enforced by the gate evaluator. When this file changes, the
#              delta becomes a required workstream in the next convoy on
#              any affected app.
# owner:       HUMAN
# update:      Manual — approved changes only. Quarterly review required.
# schema:      none
# last_update: 2026-05-30
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **These are non-negotiable.** Every user-facing web app must have all three standards.
- **Gate evaluator enforces this.** Missing standards → automatic SEND_BACK, no exceptions.
- **Drift is auto-detected.** When this file updates, the next convoy on any app surfaces the gap and must close it.
- **Shared components are the implementation target.** Build once, drop in everywhere.

# App Standards — Table Stakes

> **Every user-facing web application built or maintained under a Conduit convoy must meet these standards.**
> When this document changes, the delta becomes a required workstream in the next convoy touching each affected app.

---

## Scope

**Applies to:** interactive web applications (SvelteKit, React, Next.js, or equivalent) that have a human user interface.

**Does NOT apply to:** API-only services, CLI tools, infrastructure repos, data pipelines, background workers, or scripts. If there is no browser UI, these standards do not apply.

---

## Standard 1 — Feedback Widget

### Purpose
Every user can report bugs and request features without leaving the app. Submissions land directly in your work tracker with enough context to act on immediately — no back-channel chat messages, no "I'll remember to file that later."

### Requirements

| Requirement | Detail |
|---|---|
| **Entry point** | Floating button, bottom-right corner, every page |
| **Report types** | Bug Report and Feature Request (two distinct submission types) |
| **Screenshot** | Captured automatically at time the modal opens (`html-to-image` or browser-native) |
| **Annotation** | User can draw, highlight, and add arrows on the screenshot before submitting |
| **Text** | Free-text description field (required). Title field (required). Steps to reproduce (optional, Bug only). |
| **Context capture** | App name, current route/URL, user identity (authenticated user id if available, "anonymous" otherwise), app version or git SHA — all captured automatically, not manually entered |
| **Submission target** | Work item in the app's tracker — a Bug-type item for Bug Reports, a Story/Feature-type item for Feature Requests |
| **Tracker tagging** | Work item auto-tagged: `feedback-widget`, `app:<app-name>`, `route:<current-route>` |
| **No extra backend** | Submission goes directly to your tracker via its API — no intermediate service needed |

### Simplicity Constraint
The widget must be usable in under 30 seconds. If opening it, adding context, and submitting takes longer than that, it will not be used. Resist adding fields.

### Implementation Guidance
Canonical stack: `html-to-image` for screenshot, lightweight canvas overlay for annotation (Fabric.js or equivalent), your work tracker's API for submission.

The canonical implementation is `FeedbackWidget.svelte` (shared component). When it exists, consume it. When building the first instance for a new app, build to this spec — then extract it as the shared component so subsequent apps can drop it in.

### Compliance Signal for Gate Evaluator
- [ ] A feedback widget component exists (search: `FeedbackWidget`, feedback modal, feedback button)
- [ ] Screenshot + annotation capability is wired up
- [ ] Submission path to your work tracker is implemented and tested
- [ ] Context capture (route, identity, version) is automatic

---

## Standard 2 — In-App Help Guide with AI Assistance

### Purpose
Users get answers without leaving the app or opening a separate ticket. The AI layer means the help is conversational — not a wall of documentation the user has to search through.

### Requirements

| Requirement | Detail |
|---|---|
| **Entry point** | Help button (? icon) accessible from every page — in the nav or a persistent corner element |
| **Content** | App-specific help documentation organized by workflow and persona. Minimum: key workflows, FAQ, glossary. |
| **Context-awareness** | Help content is route-aware — opening the panel on `/settings/profile` surfaces profile help, not the home page overview |
| **AI assistance** | Text input in the help panel; user types a question; OpenAI API answers using the app's help content as context |
| **AI scope** | Answers are scoped to the app's help content. The AI is not a general assistant — it only knows what's in the help doc. |
| **Offline fallback** | If OpenAI API is unavailable, the static help content remains fully accessible |
| **Help content location** | `src/lib/help/content.md` (or equivalent) in the app repo — organized by route so the AI context slice is automatic |

### Simplicity Constraint
The help panel is a slide-out or modal — one click to open, one click to close. The AI input is a single text box. No conversation history needed; each question is independent.

### Implementation Guidance
The AI call passes the route-relevant section of `content.md` as context to OpenAI (`gpt-4o-mini` is sufficient — fast, cheap, scoped). The system prompt constrains the AI to that content only.

The canonical implementation is `HelpPanel.svelte` (shared component). Same extraction pattern as FeedbackWidget.

### Compliance Signal for Gate Evaluator
- [ ] A help panel component exists (search: `HelpPanel`, help drawer, help modal)
- [ ] Help content file exists (`content.md` or equivalent), organized by route
- [ ] Route-awareness is implemented (content selection changes based on current route)
- [ ] OpenAI API integration is present and tested
- [ ] Offline fallback (static content accessible without API) is verified

---

## Standard 3 — Version Indicator

### Purpose
Support staff and developers need to know which version of the app a feedback submission or bug report came from. One line in a footer is all this requires.

### Requirements

| Requirement | Detail |
|---|---|
| **Visibility** | Version string visible to authenticated users — footer, About modal, or equivalent |
| **Content** | Git SHA (short — 7 chars) or semantic version. Build date is a useful addition but not required. |
| **Automated** | Must be injected at build time from the pipeline — not manually updated |

### Compliance Signal for Gate Evaluator
- [ ] Version string is present in the UI (footer or About)
| - [ ] It is injected at build time (pipeline or build script), not hardcoded

---

## Drift Detection — How This Standard Evolves

When this file is updated:

1. The **Standard version** and **Last updated** fields below change.
2. The gate evaluator reads this file at evaluation time — always the latest version in `main`.
3. If an app in a convoy lacks a standard that now exists, the evaluator surfaces it as a **SEND_BACK finding**.
4. The convoy must include a workstream to close the gap. Scope is proportional to the gap — a missing version indicator is a one-task add; a missing feedback widget is a workstream.
5. Apps do not get indefinite exemptions. Once a standard exists here, the next convoy on any affected app must address it.

**This file is the source of truth. No exemptions are granted via memory, verbal agreement, or CLAUDE.md annotation.**

---

## Standard Version

| Field | Value |
|---|---|
| Standard version | 1.0 |
| Effective date | 2026-05-30 |
| Last updated | 2026-05-30 |
| Owner | project-owner |
| Next review | 2026-08-30 (quarterly) |
