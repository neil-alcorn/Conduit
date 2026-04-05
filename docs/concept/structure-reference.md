<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/concept/structure-reference.md
# description: Repo-native summary of the original structure document, with notes on what is now superseded.
# owner:       BOTH
# update:      Update when scaffold structure or source-document interpretation changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Structure Reference

## Purpose

This is the repo-native reference version of the original CONDUIT structure/build document.

It is useful for understanding:

- why the repo was scaffolded the way it was
- the original checklist order
- the managed-file header rule
- the intended relationship between folders

## Still Accurate

- the managed-file header is a core design rule
- `Convoy`, `Work Stream`, `Checkpoint`, `Gate`, `Gate Sync`, `Highway Init`, and `Repo Signal` are still the correct terms
- the overall folder model for `conduit` is still valid
- the “patterns only” borrowing rule from Gastown and EyeWitness is still correct
- the original checklist remains a good audit reference for scaffold completeness

## Superseded Or Changed

- the original document scoped the build to only the local orchestration repo in that session
  Current reality: `conduit` and `conduit-core` now both exist and are active repos.
- the original structure did not include the later `validate` command, Release Gate protocol, or self-registration improvements
- the original structure predates the runtime-enforced sanitizer ingress path
- the original structure predates Repo Signal runtime enforcement
- the original structure predates the newer architecture, handoff, and security-model docs

## Best Current Sources

Use these instead of relying on the original structure doc alone:

- [docs/architecture.md](/C:/Users/nalco/.codex/Conduit/docs/architecture.md)
- [docs/current-state.md](/C:/Users/nalco/.codex/Conduit/docs/current-state.md)
- [docs/security-model.md](/C:/Users/nalco/.codex/Conduit/docs/security-model.md)
- [docs/handoff.md](/C:/Users/nalco/.codex/Conduit/docs/handoff.md)
- [docs/round-2-change-log.md](/C:/Users/nalco/.codex/Conduit/docs/round-2-change-log.md)

## Recommendation

Keep the structure `.docx` as a source artifact and historical scaffold spec.

Use the repo-native docs for ongoing work.
