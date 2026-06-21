<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/tech-stack.md
# description: Technology stack, version requirements, and decision rationale
# owner:       HUMAN
# update:      Manual when standards change.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Standard stack:** SvelteKit 2 + adapter-node 5 + Vite 6, Drizzle + postgres.js on PostgreSQL 16, MSAL Node / OIDC auth, Terraform for IaC, a Linux Node 20 host.
- **Version rules:** `vite-plugin-svelte` `^5.0.0` with Vite 6; `"type": "module"`; startup `node index.js` (never `node build/index.js`).
- **`ORIGIN` must be set in the app's environment** or all POSTs 403; env vars via `$env/dynamic/private` only.
- Verify against this table before writing `package.json` or Terraform for new scaffolding.

# Tech Stack

## Technology Table

| Layer | Technology | Version |
|---|---|---|
| Framework | SvelteKit 2 | `^2.0.0` |
| Runtime adapter | `@sveltejs/adapter-node` | `^5.0.0` |
| Build tool | Vite | `^6.0.0` |
| Svelte Vite plugin | `@sveltejs/vite-plugin-svelte` | `^5.0.0` |
| Database ORM | Drizzle ORM | `^0.38.0` |
| DB driver | postgres.js | `^3.4.0` |
| Database | PostgreSQL 16 | — |
| Auth | MSAL Node (`@azure/msal-node`) or any OIDC client | `^2.0.0` |
| Language | TypeScript | `^5.0.0` |
| Infrastructure | Terraform | 1.7.5 |
| CI/CD | CI/CD pipeline (any provider) | — |
| Hosting | Linux host running Node 20 LTS | — |

## Decision Rationale (one sentence each)

- **SvelteKit**: Full-stack in one codebase and one deployment — no separate API server, no CORS, no split pipelines.
- **Drizzle ORM**: Schema-first TypeScript with readable committed SQL migration files; no magic, no runtime schema inference.
- **postgres.js**: Modern ESM-native PostgreSQL driver that works cleanly with SvelteKit's module system.
- **PostgreSQL**: Mature, low-cost, widely supported managed offerings — a sensible default for small-to-medium workloads.
- **MSAL Node / OIDC**: Standards-based SSO that keeps auth server-side only; swap the OIDC client for your provider.
- **Linux Node host**: Simplest deployment target for adapter-node output — no Docker or registry required for a basic deploy.
- **Terraform**: Reproducible infrastructure; all resource names, app settings, and config committed as code.

## Critical Version Rules

**`@sveltejs/vite-plugin-svelte` must be `^5.0.0` with Vite 6.**
Version 4 only supports Vite 5 and fails with a cryptic error: `failed to resolve @sveltejs/kit/vite`.

**`package.json` must have `"type": "module"`.**
Without it, Node.js treats the project as CommonJS and the build fails with an ESM resolution error.

**Startup command: `node index.js`**
Archive the build so `index.js` lands at the zip/deploy root — `node build/index.js` will fail if the root was excluded.

**`ORIGIN` must be set in the app's environment.**
SvelteKit validates CSRF on POST requests by comparing against `ORIGIN`. Without it, all form submissions return 403.

**Use `$env/dynamic/private`, not `$env/static/private` or `process.env`.**
Static env vars are baked in at build time. Dynamic reads from `process.env` at runtime, which is how most hosts inject app settings.
