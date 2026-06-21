# CONDUIT REPO ENRICHMENT PROTOCOL

Use this protocol when a repo already has `CONDUIT.md` and `CONTEXT.md`, but the context is still skeletal or stale.

## Non-Negotiables

- Do not call an LLM, model API, or external summarizer from the CLI.
- Do not paste unsanitized external content into `CONTEXT.md`.
- Keep all claims evidence-backed with repo-local anchors such as file paths, package scripts, configuration files, tests, or git history.
- Preserve the existing `CONDUIT.md` repo signals unless the user explicitly asks to edit them.

## Evidence Pass

Collect evidence with host-neutral repo tools:

- Use grep or ripgrep for entry points, command handlers, auth, persistence, external calls, and TODO markers.
- Use glob or file listing for top-level module structure, tests, configs, pipelines, and docs.
- Use `git log --oneline --decorate --max-count=30` and focused `git log -- <path>` for recent changes.
- Use package, project, or build manifests to identify scripts and runtime assumptions.

## Required CONTEXT.md Sections

Fill these sections with concise, factual content:

- `## Architecture Overview`
- `## Module or Service Map`
- `## Data Flow Summary`
- `## Authentication and Authorization`
- `## Significant Changes (Last 90 Days)`
- `## Technical Debt Relevant to Routing`
- `## Performance Characteristics`
- `## Known Failure Modes`

`Module or Service Map` and `Known Failure Modes` must include repo evidence anchors in backticks, for example `src/index.ts`, `package.json`, or `.github/workflows/build.yml`.

## Verification

After updating `CONTEXT.md`, run:

```bash
conduit init <repo-path> --enrich --verify
```

Verification checks for missing sections, placeholder text, duplicate headings, and evidence anchors before refreshing `last_context_update`.
