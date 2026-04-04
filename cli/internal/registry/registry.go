// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/registry/registry.go
// description: Highway Index read and write helpers for conduit CLI workflows.
// owner:       BOTH
// update:      Manual as registry read and write behavior is implemented.
// schema:      highway-index/schema/repo-entry.schema.json
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package registry

type RepoEntry struct {
	Slug string `json:"slug" yaml:"slug"`
}
