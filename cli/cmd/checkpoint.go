// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/cmd/checkpoint.go
// description: Checkpoint command group with Repo Signal permission enforcement.
// owner:       BOTH
// update:      Manual as checkpoint behavior is implemented.
// schema:      convoys/schema/checkpoint.schema.json
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package cmd

import (
	"fmt"

	"github.com/neil-alcorn/conduit/cli/internal/signals"
)

func runCheckpoint(args []string) error {
	args, repoPath, err := resolveRepoPath(args)
	if err != nil {
		return err
	}

	if len(args) == 0 {
		fmt.Println("usage: conduit checkpoint <create|pass|fail|list> [args] [--repo path]")
		return nil
	}

	switch args[0] {
	case "create":
		if err := signals.CheckPermission(repoPath, signals.IntentWrite); err != nil {
			return err
		}
		if len(args) < 3 {
			return fmt.Errorf("usage: conduit checkpoint create [workstream-id] [title]")
		}
		fmt.Printf("CONDUIT: checkpoint create for %s is not yet implemented\n", args[1])
		return nil
	case "pass", "fail":
		if err := signals.CheckPermission(repoPath, signals.IntentWrite); err != nil {
			return err
		}
		if len(args) < 2 {
			return fmt.Errorf("usage: conduit checkpoint %s [checkpoint-id]", args[0])
		}
		fmt.Printf("CONDUIT: checkpoint %s for %s is not yet implemented\n", args[0], args[1])
		return nil
	case "list":
		if err := signals.CheckPermission(repoPath, signals.IntentRead); err != nil {
			return err
		}
		fmt.Println("CONDUIT: checkpoint list is not yet implemented")
		return nil
	default:
		return fmt.Errorf("unknown checkpoint subcommand: %s", args[0])
	}
}
