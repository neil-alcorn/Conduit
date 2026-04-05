// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/checkpoint/store_test.go
// description: Tests for checkpoint JSONL helpers and round-trip behavior.
// owner:       BOTH
// update:      Manual when checkpoint persistence behavior changes.
// schema:      convoys/schema/checkpoint.schema.json
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package checkpoint

import (
	"path/filepath"
	"testing"
	"time"
)

func TestJSONLAppendAndRead(t *testing.T) {
	tmp := filepath.Join(t.TempDir(), "checkpoints.jsonl")
	cp := &Checkpoint{
		ID:           "CP-000002",
		WorkstreamID: "WS-0001-TST",
		Stage:        3,
		Title:        "JSONL test checkpoint",
		Status:       "passed",
		AgentRole:    "qa",
		AcceptanceCriteria: []AcceptanceCriterion{},
		CreatedAt:    time.Now().UTC(),
	}

	if err := appendJSONLToPath(tmp, cp); err != nil {
		t.Fatalf("appendJSONL failed: %v", err)
	}

	records, err := ReadJSONLFromPath(tmp)
	if err != nil {
		t.Fatalf("ReadJSONL failed: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}
	if records[0].ID != cp.ID {
		t.Fatalf("ID mismatch: got %s, want %s", records[0].ID, cp.ID)
	}
}

func TestReadJSONLMissingFileReturnsEmptySlice(t *testing.T) {
	records, err := ReadJSONLFromPath(filepath.Join(t.TempDir(), "missing.jsonl"))
	if err != nil {
		t.Fatalf("ReadJSONLFromPath returned error for missing file: %v", err)
	}
	if len(records) != 0 {
		t.Fatalf("expected empty result for missing file, got %d records", len(records))
	}
}
