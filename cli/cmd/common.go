// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/cmd/common.go
// description: Shared command helpers for repo path resolution, prompting, and flag parsing.
// owner:       BOTH
// update:      Manual when CLI command helper behavior changes.
// schema:      none
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func resolveRepoPath(args []string) ([]string, string, error) {
	remaining := make([]string, 0, len(args))
	repoPath := "."

	for i := 0; i < len(args); i++ {
		if args[i] == "--repo" {
			if i+1 >= len(args) {
				return nil, "", fmt.Errorf("missing value for --repo")
			}
			repoPath = args[i+1]
			i++
			continue
		}
		remaining = append(remaining, args[i])
	}

	absPath, err := filepath.Abs(repoPath)
	if err != nil {
		return nil, "", fmt.Errorf("resolving repo path: %w", err)
	}

	return remaining, absPath, nil
}

func parseFlagValue(args []string, flagName string) (string, []string, error) {
	remaining := make([]string, 0, len(args))
	value := ""

	for i := 0; i < len(args); i++ {
		if args[i] == flagName {
			if i+1 >= len(args) {
				return "", nil, fmt.Errorf("missing value for %s", flagName)
			}
			value = args[i+1]
			i++
			continue
		}
		remaining = append(remaining, args[i])
	}

	return value, remaining, nil
}

func readPrompt(label string) (string, error) {
	fmt.Printf("%s: ", label)
	reader := bufio.NewReader(os.Stdin)
	value, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(value), nil
}
