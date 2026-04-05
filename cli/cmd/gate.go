// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/cmd/gate.go
// description: Gate command group with Repo Signal permission enforcement for evaluation and approval.
// owner:       BOTH
// update:      Manual as gate behavior is implemented.
// schema:      none
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package cmd

import (
	"fmt"

	"github.com/neil-alcorn/conduit/cli/internal/signals"
)

func runGate(args []string) error {
	args, repoPath, err := resolveRepoPath(args)
	if err != nil {
		return err
	}

	if len(args) == 0 {
		fmt.Println("usage: conduit gate <eval|approve> [args] [--repo path]")
		return nil
	}

	switch args[0] {
	case "eval":
		if err := signals.CheckPermission(repoPath, signals.IntentRead); err != nil {
			return err
		}
		if len(args) != 3 {
			return fmt.Errorf("usage: conduit gate eval [convoy-id] [gate-type]")
		}
		fmt.Printf("CONDUIT: Gate Sync and gate evaluation for %s/%s are not yet implemented\n", args[1], args[2])
		return nil
	case "approve":
		if err := signals.CheckPermission(repoPath, signals.IntentWrite); err != nil {
			return err
		}
		if len(args) != 3 {
			return fmt.Errorf("usage: conduit gate approve [convoy-id] [gate-type]")
		}
		fmt.Printf("CONDUIT: gate approval for %s/%s is not yet implemented\n", args[1], args[2])
		return nil
	default:
		return fmt.Errorf("unknown gate subcommand: %s", args[0])
	}
}
