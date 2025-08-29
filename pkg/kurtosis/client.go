package kurtosis

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"

	"github.com/sirupsen/logrus"
)

// Client defines the interface for execution layer operations
type Client interface {
	InspectService(ctx context.Context, enclaveName, service string) (*KurtosisServiceInspectResult, error)
	DoesEnclaveExist(ctx context.Context, enclaveName string) (bool, error)
}

type client struct {
	log logrus.FieldLogger
}

// TransportProtocol represents the transport protocol type
type TransportProtocol int

const (
	TCP TransportProtocol = 0
	UDP TransportProtocol = 2
)

// KurtosisPortInfo represents port information from Kurtosis service inspect
type KurtosisPortInfo struct {
	Number                   int               `json:"number"`
	Transport                TransportProtocol `json:"transport"`
	MaybeApplicationProtocol *string           `json:"maybe_application_protocol,omitempty"`
}

// KurtosisServiceInspectResult represents the result of kurtosis service inspect command
type KurtosisServiceInspectResult struct {
	Image       string                      `json:"image"`
	Ports       map[string]KurtosisPortInfo `json:"ports"`
	PublicPorts map[string]KurtosisPortInfo `json:"public_ports"`
	Files       map[string][]string         `json:"files"`
	Entrypoint  []string                    `json:"entrypoint"`
	Cmd         []string                    `json:"cmd"`
	EnvVars     map[string]string           `json:"env_vars"`
	Labels      map[string]string           `json:"labels"`
	TiniEnabled bool                        `json:"tini_enabled"`
	TtyEnabled  bool                        `json:"tty_enabled"`
}

// NewClient creates a new kurtosis client
func NewClient(log logrus.FieldLogger) Client {
	return &client{
		log: log.WithField("package", "kurtosis"),
	}
}

// InspectKurtosisService runs `kurtosis service inspect $enclaveName $service -o json` and returns the parsed result
func (c *client) InspectService(ctx context.Context, enclaveName, service string) (*KurtosisServiceInspectResult, error) {
	// Run the kurtosis service inspect command
	cmd := exec.CommandContext(ctx, "kurtosis", "service", "inspect", enclaveName, service, "-o", "json")

	output, err := cmd.CombinedOutput()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			c.log.WithFields(logrus.Fields{
				"enclave":   enclaveName,
				"service":   service,
				"exit_code": exitErr.ExitCode(),
				"output":    string(output),
				"stderr":    string(exitErr.Stderr),
			}).Error("Kurtosis service inspect failed")
			return nil, fmt.Errorf("failed to run kurtosis service inspect command (exit code %d): %w\nOutput: %s", exitErr.ExitCode(), err, string(output))
		}
		return nil, fmt.Errorf("failed to run kurtosis service inspect command: %w\nOutput: %s", err, string(output))
	}

	// Parse the JSON output
	var result KurtosisServiceInspectResult
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON output: %w", err)
	}

	return &result, nil
}

// DoesEnclaveExist checks if an enclave exists by running `kurtosis enclave inspect {name}`
// Returns true if the enclave exists (exit code 0), false otherwise
func (c *client) DoesEnclaveExist(ctx context.Context, enclaveName string) (bool, error) {
	cmd := exec.CommandContext(ctx, "kurtosis", "enclave", "inspect", enclaveName)

	err := cmd.Run()
	if err != nil {
		// Check if it's an exit error (enclave doesn't exist)
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			c.log.WithFields(logrus.Fields{
				"enclave":   enclaveName,
				"exit_code": exitErr.ExitCode(),
			}).Debug("Enclave does not exist")
			return false, nil
		}
		// Command execution failed for other reasons
		return false, fmt.Errorf("failed to check enclave existence: %w", err)
	}

	c.log.WithField("enclave", enclaveName).Debug("Enclave exists")
	return true, nil
}

// Interface compliance check
var _ Client = (*client)(nil)
