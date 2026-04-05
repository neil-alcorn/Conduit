// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/cmd/validate.go
// description: Validation command group for Highway documents, convoy records, and aggregate checks.
// owner:       BOTH
// update:      Manual when validation behavior evolves.
// schema:      highways/repo-signals.schema.yaml
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/neil-alcorn/conduit/cli/internal/signals"
	"gopkg.in/yaml.v3"
)

type audienceDefaults struct {
	FieldAgent    int `yaml:"field_agent"`
	Customer      int `yaml:"customer"`
	Employee      int `yaml:"employee"`
	VendorPartner int `yaml:"vendor_partner"`
}

type convoyRecord struct {
	AudienceScores audienceDefaults `yaml:"audience_scores"`
	BPGateRequired bool             `yaml:"bp_gate_required"`
}

type highwayIndex struct {
	HighwayIndex struct {
		Repos []struct {
			Slug string `yaml:"slug"`
		} `yaml:"repos"`
	} `yaml:"highway_index"`
}

func runValidate(args []string) error {
	if len(args) == 0 {
		fmt.Println("usage: conduit validate <highway|convoy|all> [args]")
		return nil
	}

	switch args[0] {
	case "highway":
		if len(args) != 2 {
			return fmt.Errorf("usage: conduit validate highway [path-to-repo-or-CONDUIT.md]")
		}
		return validateHighwayPath(args[1])
	case "convoy":
		if len(args) != 2 {
			return fmt.Errorf("usage: conduit validate convoy [convoy-id]")
		}
		return validateConvoy(args[1])
	case "all":
		return validateAll()
	default:
		return fmt.Errorf("unknown validate subcommand: %s", args[0])
	}
}

func validateHighwayPath(pathArg string) error {
	targetPath := pathArg
	info, err := os.Stat(pathArg)
	if err == nil && info.IsDir() {
		targetPath = filepath.Join(pathArg, "CONDUIT.md")
	}

	fmt.Printf("CONDUIT: Validating highway document at %s...\n", targetPath)
	report, err := validateHighwayDocument(targetPath)
	if err != nil {
		return err
	}

	errorCount := 0
	for _, line := range report {
		fmt.Println(line)
		if strings.HasPrefix(line, "  x ") {
			errorCount++
		}
	}

	if errorCount > 0 {
		return fmt.Errorf("CONDUIT: Validation FAILED (%d errors)", errorCount)
	}

	fmt.Println("CONDUIT: Validation PASSED")
	return nil
}

func validateHighwayDocument(targetPath string) ([]string, error) {
	parsed, err := signals.ParseSignalsFromFile(targetPath)
	if err != nil {
		return nil, err
	}

	report := []string{
		fmt.Sprintf("  ok operational_status: %s", parsed.OperationalStatus),
		fmt.Sprintf("  ok system_class: %s", parsed.SystemClass),
	}

	requiredFields := map[string]string{
		"escalation_contacts.owner":     parsed.EscalationContacts.Owner,
		"escalation_contacts.architect": parsed.EscalationContacts.Architect,
		"escalation_contacts.security":  parsed.EscalationContacts.Security,
		"leanix_id":                     parsed.LeanIXID,
		"ado_project":                   parsed.ADOProject,
		"highway_init_date":             parsed.HighwayInitDate,
		"last_context_update":           parsed.LastContextUpdate,
	}

	if parsed.OperationalStatus == signals.StatusActive {
		for fieldName, value := range requiredFields {
			if strings.TrimSpace(value) == "" {
				report = append(report, fmt.Sprintf("  x %s: empty - required for ACTIVE repos", fieldName))
			} else {
				report = append(report, fmt.Sprintf("  ok %s: %s", fieldName, value))
			}
		}
	}

	audienceFields := map[string]int{
		"audience_defaults.field_agent":    parsed.AudienceDefaults.FieldAgent,
		"audience_defaults.customer":       parsed.AudienceDefaults.Customer,
		"audience_defaults.employee":       parsed.AudienceDefaults.Employee,
		"audience_defaults.vendor_partner": parsed.AudienceDefaults.VendorPartner,
	}

	for fieldName, value := range audienceFields {
		if value < 1 || value > 5 {
			report = append(report, fmt.Sprintf("  x %s: %d - must be 1-5", fieldName, value))
		} else {
			report = append(report, fmt.Sprintf("  ok %s: %d", fieldName, value))
		}
	}

	return report, nil
}

func validateConvoy(convoyID string) error {
	convoyPath := filepath.Join("convoys", "active", convoyID, "convoy.yaml")
	fmt.Printf("CONDUIT: Validating convoy record at %s...\n", convoyPath)

	data, err := os.ReadFile(convoyPath)
	if err != nil {
		return fmt.Errorf("reading convoy record: %w", err)
	}

	var record convoyRecord
	if err := yaml.Unmarshal(data, &record); err != nil {
		return fmt.Errorf("parsing convoy record: %w", err)
	}

	expectedBPGate := record.AudienceScores.FieldAgent >= 4 || record.AudienceScores.Customer >= 4
	if record.BPGateRequired != expectedBPGate {
		return fmt.Errorf("CONDUIT: Validation FAILED (bp_gate_required=%t, expected %t)", record.BPGateRequired, expectedBPGate)
	}

	fmt.Println("CONDUIT: Convoy validation PASSED")
	return nil
}

func validateAll() error {
	fmt.Println("CONDUIT: Running full validation...")

	passed := 0
	failed := 0

	indexData, err := os.ReadFile(filepath.Join("highway-index", "index.yaml"))
	if err == nil {
		var index highwayIndex
		if yamlErr := yaml.Unmarshal(indexData, &index); yamlErr == nil {
			for _, repoEntry := range index.HighwayIndex.Repos {
				targetPath := "CONDUIT.md"
				if repoEntry.Slug != "conduit" {
					targetPath = filepath.Join(repoEntry.Slug, "CONDUIT.md")
				}
				if _, statErr := os.Stat(targetPath); statErr != nil {
					fmt.Printf("CONDUIT: Skipping highway validation for %s (not present locally)\n", repoEntry.Slug)
					continue
				}

				if err := validateHighwayPath(targetPath); err != nil {
					fmt.Println(err.Error())
					failed++
				} else {
					passed++
				}
			}
		}
	}

	activeConvoys, readErr := os.ReadDir(filepath.Join("convoys", "active"))
	if readErr == nil {
		for _, entry := range activeConvoys {
			if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "CNV-") {
				continue
			}
			if err := validateConvoy(entry.Name()); err != nil {
				fmt.Println(err.Error())
				failed++
			} else {
				passed++
			}
		}
	}

	fmt.Printf("CONDUIT: Validation complete. Passed: %d Failed: %d\n", passed, failed)
	if failed > 0 {
		return fmt.Errorf("CONDUIT: validation failed")
	}
	return nil
}
