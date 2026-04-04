<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        highways/CONDUIT-md.template.md
# description: Template for repo-level CONDUIT.md highway documents.
# owner:       BOTH
# update:      On Highway Init and when repo signal schema changes.
# schema:      highways/repo-signals.schema.yaml
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# {{REPO_NAME}}

## Repo Signals

```yaml
operational_status: {{OPERATIONAL_STATUS}}
system_class: {{SYSTEM_CLASS}}
escalation_contacts:
  owner: "{{OWNER_CONTACT}}"
  architect: "{{ARCHITECT_CONTACT}}"
  security: "{{SECURITY_CONTACT}}"
  compliance: "{{COMPLIANCE_CONTACT}}"
  specialist: "{{SPECIALIST_CONTACT}}"
audience_defaults:
  field_agent: {{FIELD_AGENT_SCORE}}
  customer: {{CUSTOMER_SCORE}}
  employee: {{EMPLOYEE_SCORE}}
  vendor_partner: {{VENDOR_PARTNER_SCORE}}
leanix_id: "{{LEANIX_ID}}"
ado_project: "{{ADO_PROJECT}}"
highway_init_date: "{{HIGHWAY_INIT_DATE}}"
last_context_update: "{{LAST_CONTEXT_UPDATE}}"
```

## What This Repo Is

{{REPO_SUMMARY}}

## What Agents May Do Here

{{ALLOWED_ACTIONS}}

## What Agents Must Not Do Here

{{FORBIDDEN_ACTIONS}}

## Primary Audiences

{{PRIMARY_AUDIENCES}}
