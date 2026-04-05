// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/checkpoint/store.go
// description: Store orchestration for checkpoint persistence.
// owner:       BOTH
// update:      Manual when checkpoint persistence wiring changes.
// schema:      convoys/schema/checkpoint.schema.json
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package checkpoint

import (
	"database/sql"
	"encoding/json"
	"fmt"

	_ "github.com/mattn/go-sqlite3"
)

const defaultDBPath = ".conduit/checkpoints.db"

type Store struct {
	db *sql.DB
}

func NewStore() (*Store, error) {
	db, err := sql.Open("sqlite3", defaultDBPath)
	if err != nil {
		return nil, fmt.Errorf("opening checkpoint db: %w", err)
	}
	store := &Store{db: db}
	if _, err := store.db.Exec(createCheckpointsTable); err != nil {
		return nil, fmt.Errorf("creating checkpoints table: %w", err)
	}
	return store, nil
}

func (s *Store) Save(cp *Checkpoint) error {
	if err := s.upsertSQLite(cp); err != nil {
		return err
	}
	return appendJSONL(cp)
}

func (s *Store) upsertSQLite(cp *Checkpoint) error {
	if s.db == nil {
		return nil
	}

	criteria, err := json.Marshal(cp.AcceptanceCriteria)
	if err != nil {
		return fmt.Errorf("marshaling acceptance criteria: %w", err)
	}

	_, err = s.db.Exec(
		upsertCheckpoint,
		cp.ID,
		cp.WorkstreamID,
		cp.Stage,
		cp.Title,
		cp.Description,
		cp.Status,
		cp.AgentRole,
		string(criteria),
		cp.AgentSession,
		cp.StartedAt,
		cp.CompletedAt,
		cp.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("upserting checkpoint: %w", err)
	}

	return nil
}

func (s *Store) GetByWorkstream(workstreamID string) ([]Checkpoint, error) {
	if s.db == nil {
		records, err := ReadJSONL(defaultJSONLPath)
		if err != nil {
			return nil, err
		}
		return filterByWorkstream(records, workstreamID), nil
	}

	rows, err := s.db.Query(
		`SELECT id, workstream_id, stage, title, description, status, agent_role, acceptance_criteria, agent_session, started_at, completed_at, created_at
		 FROM checkpoints
		 WHERE workstream_id = ?`,
		workstreamID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying checkpoints: %w", err)
	}
	defer rows.Close()

	var records []Checkpoint
	for rows.Next() {
		var cp Checkpoint
		var criteria string
		if err := rows.Scan(
			&cp.ID,
			&cp.WorkstreamID,
			&cp.Stage,
			&cp.Title,
			&cp.Description,
			&cp.Status,
			&cp.AgentRole,
			&criteria,
			&cp.AgentSession,
			&cp.StartedAt,
			&cp.CompletedAt,
			&cp.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning checkpoint row: %w", err)
		}

		if err := json.Unmarshal([]byte(criteria), &cp.AcceptanceCriteria); err != nil {
			return nil, fmt.Errorf("decoding checkpoint criteria: %w", err)
		}
		records = append(records, cp)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating checkpoint rows: %w", err)
	}

	return records, nil
}

func filterByWorkstream(records []Checkpoint, workstreamID string) []Checkpoint {
	out := make([]Checkpoint, 0, len(records))
	for _, record := range records {
		if record.WorkstreamID == workstreamID {
			out = append(out, record)
		}
	}
	return out
}
