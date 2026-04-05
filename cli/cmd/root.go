// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/cmd/root.go
// description: Root command router for the conduit CLI.
// owner:       BOTH
// update:      Manual when CLI command registration changes.
// schema:      none
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package cmd

import (
	"fmt"
	"os"
)

type commandFunc func(args []string) error

var commandTable = map[string]commandFunc{
	"sync":       runSync,
	"init":       runInit,
	"convoy":     runConvoy,
	"gate":       runGate,
	"checkpoint": runCheckpoint,
	"status":     runStatus,
	"validate":   runValidate,
}

// Execute runs the conduit CLI.
func Execute() int {
	if len(os.Args) < 2 {
		printUsage()
		return 0
	}

	if os.Args[1] == "--version" || os.Args[1] == "version" {
		fmt.Println("conduit 0.1.0")
		return 0
	}

	if os.Args[1] == "--help" || os.Args[1] == "help" {
		printUsage()
		return 0
	}

	fn, ok := commandTable[os.Args[1]]
	if !ok {
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		printUsage()
		return 1
	}

	if err := fn(os.Args[2:]); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	return 0
}

func printUsage() {
	fmt.Println("CONDUIT - AI-native software delivery orchestration")
	fmt.Println("")
	fmt.Println("Usage:")
	fmt.Println("  conduit <command> [args]")
	fmt.Println("")
	fmt.Println("Commands:")
	fmt.Println("  sync        Refresh orchestration state before work or gates")
	fmt.Println("  init        Run Highway Init tasks")
	fmt.Println("  convoy      Manage convoys")
	fmt.Println("  gate        Evaluate or approve gates")
	fmt.Println("  checkpoint  Manage checkpoints")
	fmt.Println("  status      Show current status")
	fmt.Println("  validate    Validate CONDUIT-managed documents")
}
