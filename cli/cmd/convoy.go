// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/cmd/convoy.go
// description: Convoy command group for convoy lifecycle actions and ingress sanitization.
// owner:       BOTH
// update:      Manual as convoy management behavior is implemented.
// schema:      convoys/schema/convoy.schema.json
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/neil-alcorn/conduit/cli/internal/sanitizer"
	"github.com/neil-alcorn/conduit/cli/internal/signals"
	"gopkg.in/yaml.v3"
)

type convoyRegistry struct {
	Convoys struct {
		Active   []string `yaml:"active"`
		Archived []string `yaml:"archived"`
	} `yaml:"convoys"`
}

func runConvoy(args []string) error {
	if len(args) == 0 {
		fmt.Println("usage: conduit convoy <new|list|attach> [args]")
		return nil
	}

	switch args[0] {
	case "new":
		return runConvoyNew(args[1:])
	case "list":
		fmt.Println("conduit convoy list: not yet implemented")
		return nil
	case "attach":
		fmt.Println("conduit convoy attach: not yet implemented")
		return nil
	default:
		return fmt.Errorf("unknown convoy subcommand: %s", args[0])
	}
}

func runConvoyNew(args []string) error {
	args, repoPath, err := resolveRepoPath(args)
	if err != nil {
		return err
	}

	if err := signals.CheckPermission(repoPath, signals.IntentWrite); err != nil {
		return err
	}

	title, args, err := parseFlagValue(args, "--title")
	if err != nil {
		return err
	}
	description, args, err := parseFlagValue(args, "--description")
	if err != nil {
		return err
	}
	workType, args, err := parseFlagValue(args, "--work-type")
	if err != nil {
		return err
	}
	if len(args) > 0 {
		return fmt.Errorf("unexpected arguments: %s", strings.Join(args, " "))
	}

	if workType == "" {
		workType = "enhancement"
	}
	if title == "" {
		title, err = readPrompt("Convoy title")
		if err != nil {
			return fmt.Errorf("reading convoy title: %w", err)
		}
	}
	if description == "" {
		description, err = readPrompt("Convoy description")
		if err != nil {
			return fmt.Errorf("reading convoy description: %w", err)
		}
	}

	sanitizedTitle, err := sanitizeIngress("conduit convoy new:title", title)
	if err != nil {
		return err
	}
	sanitizedDescription, err := sanitizeIngress("conduit convoy new:description", description)
	if err != nil {
		return err
	}

	convoyID, err := nextConvoyID(repoPath)
	if err != nil {
		return err
	}

	convoyDir := filepath.Join(repoPath, "convoys", "active", convoyID)
	workstreamDir := filepath.Join(convoyDir, "workstreams")
	auditDir := filepath.Join(convoyDir, "audit")
	if err := os.MkdirAll(workstreamDir, 0o755); err != nil {
		return fmt.Errorf("creating convoy workstream directory: %w", err)
	}
	if err := os.MkdirAll(auditDir, 0o755); err != nil {
		return fmt.Errorf("creating convoy audit directory: %w", err)
	}

	today := time.Now().UTC().Format("2006-01-02")
	actor := os.Getenv("USERNAME")
	if actor == "" {
		actor = "CONDUIT"
	}

	convoyYAML := fmt.Sprintf(`# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        convoys/active/%s/convoy.yaml
# description: Active convoy metadata and state record.
# owner:       BOTH
# update:      On stage transition, gate approval, and work stream status change.
# schema:      convoys/schema/convoy.schema.json
# last_update: %s
# ─────────────────────────────────────────────────────────────────────
id: "%s"
title: "%s"
work_type: "%s"
stage: 0
status: active
ado_work_item: ""
created_date: "%s"
created_by: "%s"
audience_scores:
  field_agent: 1
  customer: 1
  employee: 1
  vendor_partner: 1
bp_gate_required: false
workstreams: []
`, convoyID, today, convoyID, yamlSafe(sanitizedTitle), workType, today, yamlSafe(actor))

	livingSpec := fmt.Sprintf(`<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        convoys/active/%s/living-spec.md
# description: Living specification for the convoy.
# owner:       BOTH
# update:      At every Stage transition; agents update and humans approve at Gates.
# schema:      none
# last_update: %s
# ─────────────────────────────────────────────────────────────────────
-->

# Living Spec: %s

**Convoy:** %s  |  **Work Type:** %s  |  **Stage:** 0
**Last Updated:** %s  |  **Updated By:** %s

---

## Intent

%s

## Audience Impact

| Audience | Score | Notes |
|----------|-------|-------|
| Field Agent | 1 | |
| Customer | 1 | |
| Employee | 1 | |
| Vendor/Partner | 1 | |

## Acceptance Criteria

- [ ] Define acceptance criteria before QA Gate review.

## Solution Design

To be proposed during Solution Design.

## Work Streams

| Work Stream ID | Repo | Stage | Status | Depends On |
|----------------|------|-------|--------|------------|

## Decisions Log

| Date | Decision | Rationale | Made By |
|------|----------|-----------|---------|

## What Was Actually Built

To be completed at Release.

## Gate History

| Gate | Stage | Approver | Date | Decision |
|------|-------|----------|------|----------|
`, convoyID, today, mdSafe(sanitizedTitle), convoyID, workType, today, mdSafe(actor), mdSafe(sanitizedDescription))

	if err := os.WriteFile(filepath.Join(convoyDir, "convoy.yaml"), []byte(convoyYAML), 0o644); err != nil {
		return fmt.Errorf("writing convoy.yaml: %w", err)
	}
	if err := os.WriteFile(filepath.Join(convoyDir, "living-spec.md"), []byte(livingSpec), 0o644); err != nil {
		return fmt.Errorf("writing living-spec.md: %w", err)
	}
	if err := os.WriteFile(filepath.Join(auditDir, "gate-log.jsonl"), []byte(""), 0o644); err != nil {
		return fmt.Errorf("writing gate-log.jsonl: %w", err)
	}
	if err := updateConvoyRegistry(repoPath, convoyID); err != nil {
		return err
	}

	fmt.Printf("CONDUIT: Created convoy %s\n", convoyID)
	return nil
}

func sanitizeIngress(commandName, input string) (string, error) {
	result, err := sanitizer.Sanitize(commandName, input)
	if err != nil {
		return "", err
	}
	if !result.Allowed {
		return "", fmt.Errorf("CONDUIT: sanitizer blocked input for %s. Review .conduit/sanitizer.log for details", commandName)
	}
	return result.Sanitized, nil
}

func nextConvoyID(repoPath string) (string, error) {
	activeRoot := filepath.Join(repoPath, "convoys", "active")
	entries, err := os.ReadDir(activeRoot)
	if err != nil {
		return "", fmt.Errorf("reading active convoys: %w", err)
	}

	maxID := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, "CNV-") {
			continue
		}
		value, convErr := strconv.Atoi(strings.TrimPrefix(name, "CNV-"))
		if convErr == nil && value > maxID {
			maxID = value
		}
	}

	return fmt.Sprintf("CNV-%04d", maxID+1), nil
}

func updateConvoyRegistry(repoPath, convoyID string) error {
	registryPath := filepath.Join(repoPath, "convoys", "registry.yaml")
	data, err := os.ReadFile(registryPath)
	if err != nil {
		return fmt.Errorf("reading convoy registry: %w", err)
	}

	var registry convoyRegistry
	if err := yaml.Unmarshal(data, &registry); err != nil {
		return fmt.Errorf("parsing convoy registry: %w", err)
	}

	registry.Convoys.Active = append(registry.Convoys.Active, convoyID)
	sort.Strings(registry.Convoys.Active)

	output, err := yaml.Marshal(&registry)
	if err != nil {
		return fmt.Errorf("encoding convoy registry: %w", err)
	}

	header := `# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        convoys/registry.yaml
# description: Master registry of active and archived convoys known to the local orchestration repo.
# owner:       BOTH
# update:      On convoy creation, archive, and status changes.
# schema:      convoys/schema/convoy.schema.json
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
`

	return os.WriteFile(registryPath, []byte(header+string(output)), 0o644)
}

func yamlSafe(value string) string {
	return strings.ReplaceAll(value, `"`, `'`)
}

func mdSafe(value string) string {
	return strings.TrimSpace(value)
}
