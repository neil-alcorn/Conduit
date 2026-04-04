// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/ado/client.go
// description: Stub ADO REST client used by the conduit CLI.
// owner:       BOTH
// update:      Manual as ADO integration behavior is implemented.
// schema:      integrations/ado/field-mappings.yaml
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package ado

type Client struct {
	BaseURL string
}
