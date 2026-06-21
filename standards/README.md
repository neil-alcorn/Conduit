## TL;DR
- **Index of agent-facing engineering standards** — the canonical reference for how work is built in this codebase.
- **Always load:** `execution-modes.md`, `agent-persona.md`, `story-quality.md`.
- **Load on relevance before implementing:** tool-use, pipeline, terraform, auth-patterns, drizzle-patterns, naming-conventions, ai-app-standards, tech-stack, sveltekit, design-quality — see the "When to Load" table below.

# Conduit Engineering Standards

Agent-facing reference files describing the team's engineering standards.

## Conduit Core Standards (load always)

| File | Covers |
|---|---|
| `execution-modes.md` | **DETERMINISTIC vs AGENTIC** — core Conduit design principle. Every step in every directive is labeled. Read this to understand how to behave in each mode. |
| `agent-persona.md` | **Conduit character** — Fun, humble, servant-leadership values. How and when to express them. Opt-out via `agents/persona.yaml`. |
| `story-quality.md` | Work-item story standards, AC format, Jay Dev pointing convention |

## Engineering Standards (load when relevant)

**Before starting implementation**, load the relevant file if your stage touches any of these areas:

| File | Covers |
|---|---|
| `tool-use.md` | Which tool to use for every job — Claude Code tools, git worktrees, npm patterns, WIP limits, model selection, context window management |
| `pipeline.md` | CI/CD pipeline patterns — change detection, build/migrate/deploy stage structure, DB firewall pattern, critical gotchas |
| `terraform.md` | Infrastructure-as-code patterns — standard blocks for web app + PostgreSQL, naming, variables, gotchas |
| `auth-patterns.md` | OIDC identity-provider setup, login/callback flow, `hooks.server.ts` auth guard, JWT validation |
| `drizzle-patterns.md` | Schema location, migration workflow, DB client setup, select/insert/upsert/join/delete patterns, CJS/ESM gotcha |
| `naming-conventions.md` | App slug pattern, cloud resource naming table, environment suffixes, repo vs brand vs slug distinction |
| `ai-app-standards.md` | 4 required features for every AI app, model defaults, user instructions injection, OpenAI env var rules |
| `tech-stack.md` | Technology table with versions, decision rationale, critical version rules (`vite-plugin-svelte`, `"type": "module"`, `ORIGIN`) |
| `sveltekit.md` | SvelteKit-specific rules, server/client boundary, seed scripts, sync requirement |
| `design-quality.md` | Design quality standard — design intent, typography, color system, motion, accessibility, no generic patterns |

## Full Human-Readable Versions

These standards files are condensed for agent consumption. They are the agent-facing summary of the team's full engineering standards.

## When to Load These Files

- **New machine / unsure which tool**: load `tool-use.md` first
- **Auth**: load `auth-patterns.md` for any feature touching login, session, permissions, or user identity
- **Database**: load `drizzle-patterns.md` for schema changes, queries, or migrations
- **New app setup**: load `naming-conventions.md` before creating any cloud resources
- **AI features**: load `ai-app-standards.md` for any OpenAI or AI-powered UX work
- **New project scaffolding**: load `tech-stack.md` to verify versions before writing `package.json` or Terraform
- **Pipeline setup or changes**: load `pipeline.md` for stage structure, service connection, and gotchas
- **Infrastructure (Terraform)**: load `terraform.md` for standard resource blocks, naming, and zone-drift gotchas
