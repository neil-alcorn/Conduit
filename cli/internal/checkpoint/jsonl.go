// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/checkpoint/jsonl.go
// description: JSONL append/read helpers for checkpoint audit logging.
// owner:       BOTH
// update:      Manual when checkpoint audit behavior changes.
// schema:      convoys/schema/checkpoint.schema.json
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package checkpoint

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const defaultJSONLPath = ".conduit/checkpoints.jsonl"

func appendJSONL(cp *Checkpoint) error {
	return appendJSONLToPath(defaultJSONLPath, cp)
}

func appendJSONLToPath(path string, cp *Checkpoint) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("creating checkpoint log directory: %w", err)
	}

	data, err := json.Marshal(cp)
	if err != nil {
		return fmt.Errorf("marshaling checkpoint jsonl record: %w", err)
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("opening checkpoint jsonl: %w", err)
	}
	defer f.Close()

	if _, err := fmt.Fprintf(f, "%s\n", data); err != nil {
		return fmt.Errorf("writing checkpoint jsonl record: %w", err)
	}

	return nil
}

func ReadJSONL(path string) ([]Checkpoint, error) {
	return ReadJSONLFromPath(path)
}

func ReadJSONLFromPath(path string) ([]Checkpoint, error) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []Checkpoint{}, nil
		}
		return nil, fmt.Errorf("opening checkpoint jsonl: %w", err)
	}
	defer f.Close()

	var records []Checkpoint
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var cp Checkpoint
		if err := json.Unmarshal(line, &cp); err != nil {
			return nil, fmt.Errorf("decoding checkpoint jsonl line: %w", err)
		}
		records = append(records, cp)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("reading checkpoint jsonl: %w", err)
	}

	return records, nil
}
