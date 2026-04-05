// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/internal/signals/signals.go
// description: Repo Signal parsing and runtime permission enforcement for repo-targeting commands.
// owner:       BOTH
// update:      Manual when Repo Signal semantics or enforcement rules change.
// schema:      highways/repo-signals.schema.yaml
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
package signals

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type OperationalStatus string
type SystemClass string

const (
	StatusActive     OperationalStatus = "ACTIVE"
	StatusReadOnly   OperationalStatus = "READ-ONLY"
	StatusObserve    OperationalStatus = "OBSERVE"
	StatusQuarantine OperationalStatus = "QUARANTINE"

	ClassModern      SystemClass = "MODERN"
	ClassLegacy      SystemClass = "LEGACY"
	ClassMainframe   SystemClass = "MAINFRAME"
	ClassIntegration SystemClass = "INTEGRATION"
	ClassExternal    SystemClass = "EXTERNAL"
)

type RepoSignals struct {
	OperationalStatus OperationalStatus `yaml:"operational_status"`
	SystemClass       SystemClass       `yaml:"system_class"`
	EscalationContacts struct {
		Owner      string `yaml:"owner"`
		Architect  string `yaml:"architect"`
		Security   string `yaml:"security"`
		Compliance string `yaml:"compliance"`
		Specialist string `yaml:"specialist"`
	} `yaml:"escalation_contacts"`
	AudienceDefaults struct {
		FieldAgent    int `yaml:"field_agent"`
		Customer      int `yaml:"customer"`
		Employee      int `yaml:"employee"`
		VendorPartner int `yaml:"vendor_partner"`
	} `yaml:"audience_defaults"`
	LeanIXID          string `yaml:"leanix_id"`
	ADOProject        string `yaml:"ado_project"`
	HighwayInitDate   string `yaml:"highway_init_date"`
	LastContextUpdate string `yaml:"last_context_update"`
}

type Intent string

const (
	IntentRead    Intent = "read"
	IntentWrite   Intent = "write"
	IntentExecute Intent = "execute"
	IntentComms   Intent = "comms"
)

func CheckPermission(repoPath string, intent Intent) error {
	conduitMD := filepath.Join(repoPath, "CONDUIT.md")
	signals, err := ParseSignalsFromFile(conduitMD)
	if err != nil {
		return fmt.Errorf(
			"CONDUIT: cannot read Repo Signals from %s - failing closed. Ensure CONDUIT.md exists and contains a valid ## Repo Signals block. Error: %w",
			conduitMD,
			err,
		)
	}

	switch signals.OperationalStatus {
	case StatusQuarantine:
		return fmt.Errorf(
			"CONDUIT: repo at %s has status QUARANTINE. No operations permitted until Highway Init is complete and status is changed to ACTIVE by the repo owner.",
			repoPath,
		)
	case StatusObserve:
		if intent != IntentRead {
			return fmt.Errorf(
				"CONDUIT: repo at %s has status OBSERVE. Only read operations are permitted. Contact %s to change status.",
				repoPath,
				signals.EscalationContacts.Owner,
			)
		}
	case StatusReadOnly:
		if intent == IntentWrite || intent == IntentExecute {
			return fmt.Errorf(
				"CONDUIT: repo at %s has status READ-ONLY. Write and execute operations are not permitted. Contact %s to change status.",
				repoPath,
				signals.EscalationContacts.Owner,
			)
		}
	case StatusActive:
		if err := checkSystemClassConstraints(signals, intent, repoPath); err != nil {
			return err
		}
	default:
		return fmt.Errorf(
			"CONDUIT: unknown operational_status '%s' in %s - failing closed. Valid values: ACTIVE, READ-ONLY, OBSERVE, QUARANTINE",
			signals.OperationalStatus,
			conduitMD,
		)
	}

	return nil
}

func ParseSignalsFromFile(conduitMDPath string) (*RepoSignals, error) {
	data, err := os.ReadFile(conduitMDPath)
	if err != nil {
		return nil, fmt.Errorf("reading CONDUIT.md: %w", err)
	}

	yamlBlock, err := ExtractRepoSignalBlock(string(data))
	if err != nil {
		return nil, err
	}

	var repoSignals RepoSignals
	if err := yaml.Unmarshal([]byte(yamlBlock), &repoSignals); err != nil {
		return nil, fmt.Errorf("parsing Repo Signals YAML: %w", err)
	}
	if repoSignals.OperationalStatus == "" {
		return nil, errors.New("operational_status is missing from Repo Signals block")
	}

	return &repoSignals, nil
}

func ExtractRepoSignalBlock(content string) (string, error) {
	headingIndex := strings.Index(content, "## Repo Signals")
	if headingIndex < 0 {
		return "", errors.New("missing ## Repo Signals heading")
	}

	afterHeading := content[headingIndex:]
	fenceStart := strings.Index(afterHeading, "```yaml")
	if fenceStart < 0 {
		return "", errors.New("missing ```yaml fence after ## Repo Signals")
	}

	blockStart := headingIndex + fenceStart + len("```yaml")
	remaining := content[blockStart:]
	fenceEnd := strings.Index(remaining, "```")
	if fenceEnd < 0 {
		return "", errors.New("missing closing ``` fence for Repo Signals")
	}

	block := strings.TrimSpace(remaining[:fenceEnd])
	if block == "" {
		return "", errors.New("Repo Signals block is empty")
	}

	return block, nil
}

func checkSystemClassConstraints(signals *RepoSignals, intent Intent, repoPath string) error {
	switch signals.SystemClass {
	case ClassMainframe:
		if intent == IntentExecute {
			return fmt.Errorf(
				"CONDUIT: repo at %s is class MAINFRAME. Automated execution is not permitted. All work requires specialist human lead. Contact specialist: %s",
				repoPath,
				signals.EscalationContacts.Specialist,
			)
		}
	case ClassExternal:
		if intent == IntentWrite || intent == IntentExecute {
			return fmt.Errorf(
				"CONDUIT: repo at %s is class EXTERNAL. Write and execute operations are not permitted on external systems.",
				repoPath,
			)
		}
	}

	return nil
}
