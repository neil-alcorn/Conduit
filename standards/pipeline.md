<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/pipeline.md
# description: CI/CD pipeline patterns. Covers stage structure, change
#              detection, DB migration safety, and gotchas.
# owner:       HUMAN
# update:      When pipeline patterns change or new gotchas are discovered.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Stage order:** DetectChanges → Infra (only if `infra/` or pipeline file changed) → Build → MigrateDb → Deploy.
- **Build:** prefer `npm install` over `npm ci` if your lockfile omits platform-specific optional deps; archive so the runtime entry (`index.js`) is at the zip root; startup `node index.js`. Secrets in the pipeline's secret variable store, never in committed YAML.
- **MigrateDb:** open the DB firewall for the runner's IP, migrate, then close it with an always-run cleanup step.
- **Never:** rerun failed jobs after a code fix (rerun reuses the old checkout) — trigger a fresh run instead.

# Pipeline Standards

This file is the agent-facing condensed CI/CD reference. It describes stage structure and patterns independent of any specific CI provider. Adapt the syntax to your CI system (the snippets below use a generic YAML shape).

---

## Standard Stage Order

```
DetectChanges → Infra → Build → MigrateDb → Deploy
```

**DetectChanges** is the gate that eliminates wasted infrastructure runs. Every pipeline should have it: only run the infra stage when `infra/` or the pipeline definition actually changed.

```yaml
- stage: DetectChanges
  jobs:
  - job: Detect
    steps:
    - checkout: self
      fetchDepth: 2
    - script: |
        # Diff against the merge target on PRs, against the previous commit otherwise.
        # Set an output variable infraChanged=true|false based on whether
        # infra/ or the pipeline definition changed.
      name: setChangeVars

- stage: Infra
  dependsOn: DetectChanges
  condition: <run only when infraChanged == true>

- stage: Build
  dependsOn: [DetectChanges, Infra]
  condition: <Build succeeded AND Infra succeeded-or-skipped>

- stage: MigrateDb
  dependsOn: [Build, Infra]
  condition: <Build succeeded AND Infra succeeded-or-skipped>
```

---

## Service Connection + Auth

- Authenticate the pipeline to your cloud using short-lived, federated credentials (OIDC / workload identity) rather than long-lived secrets where the CI provider supports it.
- Scope the deploy identity to only the resources the pipeline needs.
- Store the target subscription/project/account identifier as a pipeline variable, not in committed YAML.

For Terraform with OIDC, export the provider's credential environment variables from the federated token inside the authenticated step (e.g. `ARM_CLIENT_ID`, `ARM_OIDC_TOKEN`, `ARM_USE_OIDC=true` for the AzureRM provider — adapt to your provider).

---

## Terraform State

- Use a remote state backend (object storage with locking).
- Use one unique state key per app — e.g., `myapp.tfstate`, `dashboard.tfstate`.

---

## Build Stage Rules

- Use `npm install` (not `npm ci`) in CI if your committed lockfile omits platform-specific optional dependencies that the build runner needs (a common cross-OS gotcha with Rollup native binaries).
- When archiving the build output, ensure the runtime entry file (`index.js`) lands at the zip root — don't nest it under `build/`.
- Startup command: `node index.js` — matching where the entry file ends up in the archive.
- Keep all secrets in the CI provider's secret variable store, never in committed YAML.

---

## Database Migration Safety (MigrateDb)

A CI runner often cannot reach a managed database by default (firewall). Open access for the runner, migrate, then always close it:

```yaml
- step: Open DB access
  script: |
    runnerIp=$(curl -s https://checkip.amazonaws.com)
    # add a firewall/allowlist rule for $runnerIp on the DB
    # wait briefly for propagation

- step: Migrate
  script: npm run db:migrate
  env:
    DATABASE_URL: $(DATABASE_URL)

- step: Close DB access
  condition: always()    # ← ALWAYS clean up even if migration fails
  script: |
    # remove the firewall/allowlist rule for the runner
```

Leaving the database open after a failed migration is a security defect — the cleanup step must run unconditionally.

---

## Pipeline Variables

Set these in your CI provider's secret variable store — never in committed YAML:

| Variable | Type | Notes |
|---|---|---|
| `DATABASE_URL` | Secret | Full PostgreSQL connection string. Set per-pipeline. |
| `OIDC_CLIENT_ID` | Secret | Identity-provider app client ID |
| `OIDC_CLIENT_SECRET` | Secret | Identity-provider app client secret |
| `OPENAI_API_KEY` | Secret | If the app uses OpenAI |

---

## Deploy Environment

If your CI provider supports protected deploy environments (manual approvals, restricted credentials), create one per stage (e.g. `dev`, `staging`, `prod`) and require it on the Deploy stage. The first run may require an authorized person to approve the environment/credential access.

---

## Critical Gotchas

| Gotcha | Fix |
|---|---|
| "Rerun failed jobs" after a code fix | Don't. Trigger a new run — rerun reuses the old checkout. |
| PostgreSQL zone drift on second Terraform run | Pin the zone (or whichever value the cloud assigned) after the first apply. |
| Platform-specific deployment flags that break startup | Avoid forcing run-from-package or hardcoding a port unless your host requires it — many hosts inject `PORT` automatically. |
| Terraform state lock after a cancelled run | Run `terraform force-unlock <lock-id>` — the ID is in the error message. |
| `npm ci` fails with a missing native module | Use `npm install` instead in pipeline stages. |
