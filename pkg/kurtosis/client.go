package kurtosis

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"github.com/sirupsen/logrus"
)

// ServiceStatus represents the status of a container service
type ServiceStatus struct {
	IsRunning bool   `json:"is_running"`
	State     string `json:"state"`
	ExitCode  int    `json:"exit_code"`
	Error     string `json:"error,omitempty"`
}

// dockerState represents the Docker container state from inspect
type dockerState struct {
	Running    bool   `json:"Running"`
	Status     string `json:"Status"`
	ExitCode   int    `json:"ExitCode"`
	OOMKilled  bool   `json:"OOMKilled"`
	Error      string `json:"Error"`
	FinishedAt string `json:"FinishedAt"`
}

// Static errors for better error handling
var (
	ErrEmptyUUID         = errors.New("empty UUID found for enclave")
	ErrUUIDNotFound      = errors.New("UUID not found in enclave inspect output")
	ErrContainerNotFound = errors.New("container not found for service")
)

// Client defines the interface for execution layer operations
type Client interface {
	InspectService(ctx context.Context, enclaveName, service string) (*KurtosisServiceInspectResult, error)
	DoesEnclaveExist(ctx context.Context, enclaveName string) (bool, error)
	GetServiceStatus(ctx context.Context, enclaveName, serviceName string) (*ServiceStatus, error)
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

// DoesEnclaveExist checks if an enclave exists by attempting to get its UUID
// Returns true if the enclave exists, false otherwise
func (c *client) DoesEnclaveExist(ctx context.Context, enclaveName string) (bool, error) {
	_, err := c.getEnclaveUUID(ctx, enclaveName)
	if err != nil {
		// Check if it's an enclave not found error
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

// GetServiceStatus retrieves the current status of a service container
func (c *client) GetServiceStatus(ctx context.Context, enclaveName, serviceName string) (*ServiceStatus, error) {
	// Get the enclave UUID
	enclaveUUID, err := c.getEnclaveUUID(ctx, enclaveName)
	if err != nil {
		return nil, fmt.Errorf("failed to get enclave UUID: %w", err)
	}

	// Find the container using Docker labels
	containerID, err := c.findContainer(ctx, enclaveUUID, serviceName)
	if err != nil {
		return nil, err
	}

	if containerID == "" {
		return &ServiceStatus{
			IsRunning: false,
			State:     "not-found",
			ExitCode:  -1,
			Error:     "Container not found for service '" + serviceName + "' in enclave '" + enclaveName + "'",
		}, nil
	}

	c.log.WithFields(logrus.Fields{
		"enclave":      enclaveName,
		"service":      serviceName,
		"container_id": containerID,
	}).Debug("Found container for service")

	// Get container state
	state, err := c.inspectContainerState(ctx, containerID)
	if err != nil {
		return nil, err
	}

	// Build ServiceStatus based on Docker state
	status := &ServiceStatus{
		IsRunning: state.Running,
		State:     state.Status,
		ExitCode:  state.ExitCode,
	}

	// Generate error messages for various failure conditions
	if !state.Running {
		status.Error = c.buildErrorMessage(state)
	}

	// Add Docker error if present and no other error
	if state.Error != "" && status.Error == "" {
		status.Error = "Docker reported error: " + state.Error
	}

	c.log.WithFields(logrus.Fields{
		"enclave":      enclaveName,
		"service":      serviceName,
		"container_id": containerID,
		"is_running":   status.IsRunning,
		"state":        status.State,
		"exit_code":    status.ExitCode,
		"has_error":    status.Error != "",
	}).Debug("Retrieved service status")

	return status, nil
}

// getEnclaveUUID retrieves the full UUID for a given enclave name
func (c *client) getEnclaveUUID(ctx context.Context, enclaveName string) (string, error) {
	cmd := exec.CommandContext(ctx, "kurtosis", "enclave", "inspect", enclaveName, "--full-uuids")

	output, err := cmd.CombinedOutput()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			c.log.WithFields(logrus.Fields{
				"enclave":   enclaveName,
				"exit_code": exitErr.ExitCode(),
				"output":    string(output),
			}).Error("Failed to get enclave UUID")
			return "", fmt.Errorf("enclave '%s' not found or inaccessible: %w", enclaveName, err)
		}
		return "", fmt.Errorf("failed to inspect enclave '%s': %w", enclaveName, err)
	}

	// Parse output to find UUID line
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "UUID:") {
			uuid := strings.TrimSpace(strings.TrimPrefix(line, "UUID:"))
			if uuid == "" {
				return "", fmt.Errorf("%w: %s", ErrEmptyUUID, enclaveName)
			}
			c.log.WithFields(logrus.Fields{
				"enclave": enclaveName,
				"uuid":    uuid,
			}).Debug("Retrieved enclave UUID")
			return uuid, nil
		}
	}

	return "", fmt.Errorf("%w: %s", ErrUUIDNotFound, enclaveName)
}

// findContainer finds the container ID for a service
func (c *client) findContainer(ctx context.Context, enclaveUUID, serviceName string) (string, error) {
	// enclaveUUID and serviceName are from kurtosis output, so they're safe to use
	cmd := exec.CommandContext(ctx, "docker", "ps", "-a", // #nosec G204
		"--filter", "label=com.kurtosistech.enclave-id="+enclaveUUID,
		"--filter", "label=com.kurtosistech.id="+serviceName,
		"--format", "{{.ID}}")

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("failed to find container for service '%s': %w", serviceName, err)
	}

	return strings.TrimSpace(string(output)), nil
}

// inspectContainerState inspects the container state using Docker
func (c *client) inspectContainerState(ctx context.Context, containerID string) (*dockerState, error) {
	// Use static args to avoid G204 linting issue - containerID is from docker ps output so it's safe
	cmd := exec.CommandContext(ctx, "docker", "inspect", "--format", "{{json .State}}", containerID) // #nosec G204
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to inspect container '%s': %w", containerID, err)
	}

	// Parse the Docker state
	var state dockerState
	if err := json.Unmarshal(output, &state); err != nil {
		return nil, fmt.Errorf("failed to parse container state JSON: %w", err)
	}

	return &state, nil
}

// buildErrorMessage builds appropriate error message based on container state
func (c *client) buildErrorMessage(state *dockerState) string {
	switch {
	case state.OOMKilled:
		return "Container was killed due to out of memory (OOM). Exit code: " + strconv.Itoa(state.ExitCode)
	case state.ExitCode != 0:
		return "Container exited with non-zero exit code: " + strconv.Itoa(state.ExitCode)
	case state.Error != "":
		return "Container error: " + state.Error
	case state.Status == "exited":
		return "Container exited normally with code: " + strconv.Itoa(state.ExitCode)
	case state.Status != "created":
		// Only report as error if not in created state (created is normal for stopped containers)
		return "Container is not running. Status: " + state.Status
	default:
		return ""
	}
}

// Interface compliance check
var _ Client = (*client)(nil)
