// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/sanitizer/sanitizer.go
// description: Stub sanitizer package for CLI-side input safety checks.
// owner:       BOTH
// update:      Manual as injection hardening behavior is implemented.
// schema:      security/sanitizer/patterns.yaml
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package sanitizer

func Enabled() bool {
	return true
}
