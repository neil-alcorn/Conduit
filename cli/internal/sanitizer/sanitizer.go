// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/sanitizer/sanitizer.go
// description: CLI-side fail-closed wrapper around the TypeScript sanitizer subprocess.
// owner:       BOTH
// update:      Manual when ingress sanitization behavior changes.
// schema:      security/sanitizer/patterns.yaml
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package sanitizer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Result struct {
	Allowed   bool
	Sanitized string
	Decision  string
	Patterns  []string
	LogEntry  string
}

type cliResponse struct {
	Allowed   bool     `json:"allowed"`
	Sanitized string   `json:"sanitized"`
	Decision  string   `json:"decision"`
	Matches   []string `json:"matches"`
}

func Enabled() bool {
	return true
}

func Sanitize(commandName, input string) (*Result, error) {
	repoRoot, err := findRepoRoot()
	if err != nil {
		return nil, failClosed(repoRoot, commandName, input, "sanitizer_unavailable")
	}

	scriptPath := filepath.Join(repoRoot, "dist", "security", "sanitizer", "cli.js")
	if _, err := os.Stat(scriptPath); err != nil {
		return nil, failClosed(repoRoot, commandName, input, "sanitizer_unavailable")
	}

	cmd := exec.Command("node", scriptPath, commandName)
	cmd.Dir = repoRoot
	cmd.Stdin = strings.NewReader(input)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, failClosed(repoRoot, commandName, input, "sanitizer_unavailable")
	}

	var response cliResponse
	if err := json.Unmarshal(output, &response); err != nil {
		return nil, failClosed(repoRoot, commandName, input, "sanitizer_parse_error")
	}

	decision := mapDecision(response.Decision)
	result := &Result{
		Allowed:   response.Allowed,
		Sanitized: response.Sanitized,
		Decision:  decision,
		Patterns:  response.Matches,
	}

	logEntry, logErr := appendLog(repoRoot, commandName, input, decision, response.Matches)
	if logErr == nil {
		result.LogEntry = logEntry
	}

	if !result.Allowed {
		return result, fmt.Errorf("CONDUIT: sanitizer blocked content for %s", commandName)
	}

	return result, nil
}

func failClosed(repoRoot, commandName, input, pattern string) error {
	if repoRoot != "" {
		_, _ = appendLog(repoRoot, commandName, input, "block", []string{pattern})
	}
	return fmt.Errorf("sanitizer unavailable: fail closed")
}

func mapDecision(decision string) string {
	switch decision {
	case "block_and_escalate":
		return "block"
	case "sanitize_and_log":
		return "sanitize"
	default:
		return "allow"
	}
}

func findRepoRoot() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}

	current := wd
	for {
		if _, statErr := os.Stat(filepath.Join(current, ".conduit")); statErr == nil {
			return current, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			return "", fmt.Errorf("repo root not found")
		}
		current = parent
	}
}

func appendLog(repoRoot, commandName, input, decision string, patterns []string) (string, error) {
	hash := sha256.Sum256([]byte(input))
	entry := fmt.Sprintf(
		"%s command=%s input_sha256=%s decision=%s patterns=%s",
		time.Now().UTC().Format(time.RFC3339),
		commandName,
		hex.EncodeToString(hash[:]),
		decision,
		strings.Join(patterns, ","),
	)

	logPath := filepath.Join(repoRoot, ".conduit", "sanitizer.log")
	file, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return "", err
	}
	defer file.Close()

	if _, err := fmt.Fprintln(file, entry); err != nil {
		return "", err
	}

	return entry, nil
}
