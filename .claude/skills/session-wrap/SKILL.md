---
name: session-wrap
description: Wrap up a Conduit work session by saving a complete handoff, committing repo state, and producing a carry-over prompt.
allowed-tools: Bash, Read, Glob, Grep
---

<!--
# CONDUIT MANAGED FILE
# file:        .claude/skills/session-wrap/SKILL.md
# description: Wrap up a Conduit work session by saving a complete handoff, committing repo state, and producing a carry-over prompt.
# owner:       nalco
# update:      Manual
# schema:      none
# last_update: 2026-06-21
-->

# session-wrap

## Purpose

Wrap up a Conduit work session so a fresh Claude, Codex, or other agent-host session can resume without replaying the chat. Capture durable context, verify the current state, commit the intended changes, and return a copy-paste prompt for the next session.

## When to trigger

- The user invokes `/session-wrap`, says "wrap this session", asks to preserve context before a reset, or asks for a carry-over prompt.
- A Conduit session has produced meaningful work that should survive terminal, agent, or context loss.
- The current task is at a natural pause point and repo state should be committed or explicitly left uncommitted with a reason.

## When NOT to trigger

- Do not run for a simple status check with no work to preserve.
- Do not commit unrelated user changes. Leave them untouched and call them out in the final handoff.
- Do not push unless the user explicitly asked, the repo behavior policy requires it, or the current workflow already established push as expected.
- Do not claim tests passed unless the commands actually ran in this wrap-up or earlier in the same session.

## Scope

- **Bounded to:** the active Conduit repo, the active convoy session directory, and any target repo already touched during the current task.
- **Writes to:** `convoys/active/<id>/sessions/handoff-*.yaml`, Conduit audit/session files created by `conduit session save`, and git commits for intended current-session changes.
- **Requires review:** no for personal use; yes before shared/team distribution if it will push, touch work trackers, or change approval state.

## Prerequisites

- Work from the repo root when possible.
- If an active convoy exists, prefer its convoy ID. If not, save to `.conduit/sessions`.
- If multiple repos were touched, wrap each repo separately in the handoff and commit only the changes that belong to the current task.

## Example invocations

- `/session-wrap`
  - Save a full handoff, run relevant verification, commit intended changes, and print a new-session prompt.
- `/session-wrap before this terminal resets`
  - Preserve the current objective, files, decisions, verification status, and next action in a handoff file.
- `/session-wrap but do not push`
  - Commit locally when appropriate, skip push, and state that the next session starts from local commits.

## Steps

1. **Orient.**
   - Run `git status --short` in the Conduit repo and every target repo touched this session.
   - Run `conduit context` when an active convoy is likely, or `conduit status` when a lighter check is enough.
   - Identify the active convoy ID, current objective, current stage, files changed, verification already run, and remaining work.

2. **Create the handoff.**
   - Run `conduit session save [convoy-id] --reason "session-wrap" --summary "<one sentence>" --notes "<critical note>"`.
   - Open the generated `handoff-*.yaml` and replace placeholders with a compact but complete record:
     - `summary`: what changed and why.
     - `decisions_made`: decisions with rationale, not just outcomes.
     - `work_completed`: completed tasks and files.
     - `work_remaining`: next tasks in execution order.
     - `blockers`: unresolved failures, missing input, or skipped verification.
     - `files_modified`: paths changed this session.
     - `context_notes`: commands run, test results, repo/branch state, and gotchas.

3. **Verify before commit.**
   - Run the narrowest meaningful verification for touched work.
   - For Conduit CLI changes, run `npm.cmd run build`; run targeted `node --test dist/cli/src/tests/<file>.test.js` when there is a relevant test, and run full `npm.cmd test` only when the blast radius warrants it or the user asked.
   - Record exact commands and results in the handoff.

4. **Commit intended changes.**
   - Review `git diff --stat` and `git diff --name-only`.
   - Stage only files that belong to this session.
   - Commit with a clear message. Prefer separate commits per repo or concern when both Conduit state and target-repo implementation changed.
   - Leave unrelated dirty files uncommitted and name them in the final response.

5. **Emit the carry-over prompt.**
   - Return a paste-ready prompt for a fresh session. Include:
     - repo path and convoy ID, if any
     - latest handoff path
     - current branch/commit
     - verification status
     - next action
     - instruction to run `conduit session resume [convoy-id]` and then continue from `work_remaining`

## Verification

- A new `handoff-*.yaml` exists and has no fill-in placeholders.
- `git status --short` is clean for files intentionally committed, or every remaining dirty file is explained.
- Relevant verification commands are recorded with pass/fail/skipped status.
- The final response includes a carry-over prompt that can resume the work without extra context from the old session.

## Security Notes

- Never commit credentials, local-only secrets, `.env` files, or unrelated user work.
- Never rewrite history, reset, or remove files during wrap-up unless the user explicitly asked for that operation.
- Prefer local commits. Push only with explicit user intent or established repo behavior.
- Keep the handoff concise; do not dump the raw conversation transcript unless the user specifically asks.
