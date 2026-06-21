<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/terraform.md
# description: Terraform / infrastructure-as-code patterns.
#              Layout, standard blocks, variables, and gotchas.
# owner:       HUMAN
# update:      When infrastructure patterns change or new gotchas are discovered.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Layout:** `infra/main.tf` + `variables.tf` + `outputs.tf` — no modules, no `.tfvars`; vars via pipeline `-var` flags, remote state per app.
- **Standard blocks:** a small compute plan, a Node 20 web app with `https_only` + `ORIGIN`, a PostgreSQL 16 server with a firewall rule scoped to your app tier.
- **Don't set host-specific deployment flags** (e.g. run-from-package or a hardcoded port) unless your host requires them — they commonly break startup.
- **Zone drift:** don't set `zone` on first apply — pin afterward. State lock → `terraform force-unlock <id>`; transient provider API errors → new run, never "Rerun failed jobs".

# Terraform Standards

This file is the agent-facing condensed IaC reference. The concrete resource blocks below use the AzureRM provider as a worked example — adapt them to your cloud provider's resource types, keeping the same layout, naming, and gotcha discipline.

---

## File Structure

```
infra/
  main.tf       ← all resources
  variables.tf  ← variable declarations
  outputs.tf    ← app URL, PostgreSQL FQDN
```

No modules. No `.tfvars` files (credentials would be in git). State is remote; configured in the pipeline.

---

## Resource Naming Convention

```
rg-<app-name>-<environment>        Resource group / project
asp-<app-name>-<environment>       Compute / app-service plan
app-<app-name>-<environment>       Web app / service
psql-<app-name>-<environment>      PostgreSQL server
```

See `naming-conventions.md` for the full slug-derived naming scheme and environment suffixes.

---

## Standard Resource Blocks

### Resource Group
```hcl
resource "azurerm_resource_group" "main" {
  name     = "rg-<app-name>-${var.environment}"
  location = var.location
  tags     = var.tags
}
```

### Compute plan (use a tier that supports always-on)
```hcl
resource "azurerm_service_plan" "main" {
  name                = "asp-<app-name>-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  sku_name            = "B1"
  tags                = var.tags
}
```

### Linux Web App (Node 20)
```hcl
resource "azurerm_linux_web_app" "main" {
  name                = "app-<app-name>-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = true

  site_config {
    application_stack { node_version = "20-lts" }
    always_on = true
  }

  app_settings = {
    "NODE_ENV"     = "production"
    "ORIGIN"       = "https://app-<app-name>-${var.environment}.example.com"  # the app's public URL
    "DATABASE_URL" = "postgresql://${var.db_admin_login}:${var.db_admin_password}@${azurerm_postgresql_flexible_server.main.fqdn}/<dbname>?sslmode=require"
    # Secrets (OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, etc.) come from pipeline secret variables
    # Avoid host-specific deployment flags (run-from-package, hardcoded port) — see gotchas
  }

  tags = var.tags
}
```

### PostgreSQL Flexible Server (B1ms)
```hcl
resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "psql-<app-name>-${var.environment}"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "16"
  administrator_login    = var.db_admin_login
  administrator_password = var.db_admin_password
  storage_mb             = 32768
  sku_name               = "B_Standard_B1ms"
  zone                   = "1"   # ← pin AFTER first run (see gotchas)
  tags                   = var.tags

  authentication {
    active_directory_auth_enabled = false
    password_auth_enabled         = true
  }
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = "<dbname>"
  server_id = azurerm_postgresql_flexible_server.main.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

# Allow the platform's own services (web app → PostgreSQL). Does not allow internet traffic.
resource "azurerm_postgresql_flexible_server_firewall_rule" "platform_services" {
  name             = "allow-platform-services"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
```

---

## variables.tf
```hcl
variable "environment"      { type = string; default = "dev" }
variable "location"         { type = string; default = "East US 2" }
variable "subscription_id"  { type = string }
variable "db_admin_login"   { type = string }
variable "db_admin_password" { type = string; sensitive = true }
variable "tags" {
  type    = map(string)
  default = { environment = "dev"; project = "<app-name>"; managed_by = "terraform" }
}
```

Variables are passed via `-var` flags in the pipeline. Never store credentials in `.tfvars`.

---

## outputs.tf
```hcl
output "app_url"          { value = "https://${azurerm_linux_web_app.main.default_hostname}" }
output "postgresql_fqdn"  { value = azurerm_postgresql_flexible_server.main.fqdn }
```

---

## Adding a New App

1. Copy `infra/` from an existing app
2. Replace all resource aliases and names with `<new-app>`
3. Set a unique state key in the pipeline configuration
4. Do NOT set `zone` on first apply — let the cloud assign it, then pin it after (see gotchas)
5. Add `DATABASE_URL` as a secret pipeline variable in your CI provider

---

## Gotchas

| Gotcha | Fix |
|---|---|
| PostgreSQL zone drift on second run | The cloud assigns a zone on first create; Terraform sees a diff on the second run. Pin `zone = "<assigned>"` after the first apply. The zone is shown in the error: `zone = "3" -> null`. |
| Host-specific run-from-package flag | Avoid unless your host requires it — it commonly causes failed deploys. Let the deploy tooling own the deployment method. |
| Hardcoded application port | Avoid — many hosts inject `PORT` automatically and setting it breaks health checks. |
| Transient provider API errors (`HTTP response was nil`) | Transient. Trigger a new pipeline run — do NOT use "Rerun failed jobs". |
| State lock after cancelled run | `terraform force-unlock <lock-id>` — ID is in the error message. |
| `always_on = true` on a free/shared tier | Requires a paid tier. Use a small paid tier for dev apps. |
