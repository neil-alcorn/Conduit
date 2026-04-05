// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/signals/signals_test.go
// description: Unit tests for Repo Signal markdown parsing and fail-closed behavior.
// owner:       BOTH
// update:      Manual when Repo Signal parsing or validation behavior changes.
// schema:      highways/repo-signals.schema.yaml
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package signals

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtractRepoSignalBlock(t *testing.T) {
	content := "## Repo Signals\n```yaml\noperational_status: ACTIVE\nsystem_class: MODERN\n```\n"
	block, err := ExtractRepoSignalBlock(content)
	if err != nil {
		t.Fatalf("expected block, got error: %v", err)
	}
	if block != "operational_status: ACTIVE\nsystem_class: MODERN" {
		t.Fatalf("unexpected block: %q", block)
	}
}

func TestExtractRepoSignalBlockMissingHeading(t *testing.T) {
	if _, err := ExtractRepoSignalBlock("```yaml\noperational_status: ACTIVE\n```"); err == nil {
		t.Fatal("expected missing heading error")
	}
}

func TestExtractRepoSignalBlockMissingFence(t *testing.T) {
	if _, err := ExtractRepoSignalBlock("## Repo Signals\noperational_status: ACTIVE\n"); err == nil {
		t.Fatal("expected missing fence error")
	}
}

func TestParseSignalsMalformedYAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "CONDUIT.md")
	content := "## Repo Signals\n```yaml\noperational_status: [ACTIVE\nsystem_class: MODERN\n```\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("writing CONDUIT.md: %v", err)
	}
	if _, err := ParseSignalsFromFile(path); err == nil {
		t.Fatal("expected malformed YAML error")
	}
}

func TestCheckPermissionFailClosedWhenConduitMissing(t *testing.T) {
	err := CheckPermission(t.TempDir(), IntentWrite)
	if err == nil || !strings.Contains(err.Error(), "failing closed") {
		t.Fatalf("expected fail-closed error, got %v", err)
	}
}

func TestCheckPermissionBlocksQuarantine(t *testing.T) {
	repoPath := writeConduitMarkdown(t, "QUARANTINE", "MODERN")
	err := CheckPermission(repoPath, IntentWrite)
	if err == nil || !strings.Contains(err.Error(), "QUARANTINE") {
		t.Fatalf("expected QUARANTINE error, got %v", err)
	}
}

func TestCheckPermissionBlocksReadOnlyWrites(t *testing.T) {
	repoPath := writeConduitMarkdown(t, "READ-ONLY", "MODERN")
	err := CheckPermission(repoPath, IntentWrite)
	if err == nil || !strings.Contains(err.Error(), "READ-ONLY") {
		t.Fatalf("expected READ-ONLY error, got %v", err)
	}
}

func TestCheckPermissionBlocksMainframeExecute(t *testing.T) {
	repoPath := writeConduitMarkdown(t, "ACTIVE", "MAINFRAME")
	err := CheckPermission(repoPath, IntentExecute)
	if err == nil || !strings.Contains(err.Error(), "MAINFRAME") {
		t.Fatalf("expected MAINFRAME execute error, got %v", err)
	}
}

func TestCheckPermissionAllowsActiveModernWrite(t *testing.T) {
	repoPath := writeConduitMarkdown(t, "ACTIVE", "MODERN")
	if err := CheckPermission(repoPath, IntentWrite); err != nil {
		t.Fatalf("expected ACTIVE MODERN repo to allow write intent, got %v", err)
	}
}

func writeConduitMarkdown(t *testing.T, status string, class string) string {
	t.Helper()

	repoPath := t.TempDir()
	content := "## Repo Signals\n```yaml\n" +
		"operational_status: " + status + "\n" +
		"system_class: " + class + "\n" +
		"escalation_contacts:\n" +
		"  owner: owner\n" +
		"  architect: architect\n" +
		"  security: security\n" +
		"  compliance: compliance\n" +
		"  specialist: specialist\n" +
		"audience_defaults:\n" +
		"  field_agent: 1\n" +
		"  customer: 1\n" +
		"  employee: 1\n" +
		"  vendor_partner: 1\n" +
		"leanix_id: leanix\n" +
		"ado_project: CONDUIT\n" +
		"highway_init_date: 2026-04-04\n" +
		"last_context_update: 2026-04-04\n" +
		"```\n"
	if err := os.WriteFile(filepath.Join(repoPath, "CONDUIT.md"), []byte(content), 0o644); err != nil {
		t.Fatalf("writing test CONDUIT.md: %v", err)
	}
	return repoPath
}
