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
}

// Execute runs the conduit CLI.
func Execute() int {
	if len(os.Args) < 2 {
		printUsage()
		return 1
	}

	if os.Args[1] == "--version" || os.Args[1] == "version" {
		fmt.Println("conduit 0.1.0")
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
	fmt.Println("conduit <sync|init|convoy|gate|checkpoint|status> [args]")
}
