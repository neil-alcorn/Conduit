// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/checkpoint/store.go
// description: Checkpoint persistence stub adapting the approved git-backed SQLite and JSONL pattern.
// owner:       BOTH
// update:      Manual as checkpoint persistence is implemented.
// schema:      convoys/schema/checkpoint.schema.json
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package checkpoint

type Record struct {
	ID           string
	WorkstreamID string
	Status       string
}
