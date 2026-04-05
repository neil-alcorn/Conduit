// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/checkpoint/schema.go
// description: SQLite schema constants and checkpoint record types.
// owner:       BOTH
// update:      Manual when checkpoint persistence schema changes.
// schema:      convoys/schema/checkpoint.schema.json
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package checkpoint

import "time"

// Checkpoint is the atomic unit of work within a Work Stream.
type Checkpoint struct {
	ID                 string                `json:"id"`
	WorkstreamID       string                `json:"workstream_id"`
	Stage              int                   `json:"stage"`
	Title              string                `json:"title"`
	Description        string                `json:"description,omitempty"`
	Status             string                `json:"status"`
	AgentRole          string                `json:"agent_role"`
	AcceptanceCriteria []AcceptanceCriterion `json:"acceptance_criteria"`
	AgentSession       string                `json:"agent_session,omitempty"`
	StartedAt          *time.Time            `json:"started_at,omitempty"`
	CompletedAt        *time.Time            `json:"completed_at,omitempty"`
	CreatedAt          time.Time             `json:"created_at"`
}

type AcceptanceCriterion struct {
	Criterion string `json:"criterion"`
	Result    string `json:"result"`
	Notes     string `json:"notes,omitempty"`
}

const createCheckpointsTable = `
CREATE TABLE IF NOT EXISTS checkpoints (
    id                  TEXT PRIMARY KEY,
    workstream_id       TEXT NOT NULL,
    stage               INTEGER NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    status              TEXT NOT NULL DEFAULT 'pending',
    agent_role          TEXT NOT NULL,
    acceptance_criteria TEXT NOT NULL DEFAULT '[]',
    agent_session       TEXT,
    started_at          DATETIME,
    completed_at        DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);`

const upsertCheckpoint = `
INSERT INTO checkpoints
    (id, workstream_id, stage, title, description, status, agent_role,
     acceptance_criteria, agent_session, started_at, completed_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    status=excluded.status,
    acceptance_criteria=excluded.acceptance_criteria,
    agent_session=excluded.agent_session,
    started_at=excluded.started_at,
    completed_at=excluded.completed_at;`
