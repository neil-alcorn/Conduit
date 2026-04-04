// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/main.go
// description: Entrypoint for the conduit CLI binary.
// owner:       BOTH
// update:      Manual for command surface changes; generated during scaffolding.
// schema:      none
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package main

import (
	"os"

	"github.com/neil-alcorn/conduit/cli/cmd"
)

func main() {
	os.Exit(cmd.Execute())
}
