<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/naming-conventions.md
# description: App slug pattern and cloud resource naming conventions
# owner:       HUMAN
# update:      Manual when standards change.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Everything derives from the app slug** `<app>-<env>`: cloud-resource prefixes, `<slug>.tfstate`, `<slug>-deploy.yml`, DB name = slug underscored.
- **Env suffixes:** `-dev`, `-staging`, `-prod` — pick one pattern per app and stay consistent.
- **Repo name ≠ brand ≠ slug** — cloud resources and user-visible names use brand/slug, never the (possibly historical) repo name.
- Apply before proposing or creating any cloud resource or new repo (referenced from Stage 1/2 directives).

# Naming Conventions

## App Slug Pattern

Every app has a canonical slug: `<app>-<env>` (e.g., `myapp-dev`, `dashboard-dev`).
All cloud resource names, pipeline variables, and URLs derive from this slug.

## Cloud Resource Naming

Use a consistent, prefixed pattern so resources are self-describing and sortable. The prefixes below are examples — adapt them to your cloud provider's conventions, but keep one scheme across all apps.

| Resource | Pattern | Example |
|---|---|---|
| Resource group / project | `rg-<app-slug>-<env>` | `rg-myapp-dev` |
| Compute / app-service plan | `asp-<app-slug>-<env>` | `asp-myapp-dev` |
| Web app / service | `app-<app-slug>-<env>` | `app-myapp-dev` |
| App URL | `https://<your-host-for-app-slug>` | `https://myapp-dev.example.com` |
| PostgreSQL server | `psql-<app-slug>-<env>` | `psql-myapp-dev` |
| PostgreSQL database | `<app-slug-underscored>` | `myapp` |
| Terraform state key | `<app-slug>.tfstate` | `myapp.tfstate` |
| Pipeline definition | `<app-slug>-deploy.yml` | `myapp-deploy.yml` |
| Pipeline `appName` var | `app-<app-slug>-<env>` | `app-myapp-dev` |
| Pipeline `appResourceGroup` var | `rg-<app-slug>-<env>` | `rg-myapp-dev` |

## Environment Suffixes

| Environment | Suffix | Example |
|---|---|---|
| Development | `-dev` | `app-myapp-dev` |
| Staging | `-staging` | `app-myapp-staging` |
| Production | `-prod` | `app-myapp-prod` |

Pick one suffix pattern and be consistent within the app.

## Repo vs Brand vs Slug

The three names for an app are distinct:

| Thing | Value | Where used |
|---|---|---|
| Repo name | `dashboard-lab` | Git URL, repo host UI |
| App brand | `Dashboard` | UI, page titles, documentation |
| Cloud slug | `dashboard` | All cloud resource names |
| DB name | `dashboard` | PostgreSQL database name |

The repo name may differ from the cloud slug (historical naming from scaffolding). Everything visible to users and everything in the cloud uses the brand/slug form, not the repo name.

## Repository Layout

Keep the pipeline definition (e.g. `<app-slug>-deploy.yml`) in a predictable location in the repo root or a `pipelines/` (or `Builds/`) directory, and apply it consistently across repos.
