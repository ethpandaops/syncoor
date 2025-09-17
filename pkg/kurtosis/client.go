package kurtosis

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/filters"
	"github.com/moby/moby/api/types/mount"
	dockerclient "github.com/moby/moby/client"
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
	Paused     bool   `json:"Paused"`
	Restarting bool   `json:"Restarting"`
	Dead       bool   `json:"Dead"`
	ExitCode   int    `json:"ExitCode"`
	OOMKilled  bool   `json:"OOMKilled"`
	Error      string `json:"Error"`
	FinishedAt string `json:"FinishedAt"`
}

// VolumeMount represents a Docker volume mount for service discovery
type VolumeMount struct {
	Type        string // bind, volume, tmpfs
	Name        string // volume name (for named volumes)
	Source      string // host path (for bind mounts) or volume name
	Destination string // container path
	Driver      string // volume driver
	Mode        string // rw, ro, z, Z
	RW          bool   // read-write flag
	Propagation string // mount propagation
}

// ServiceEndpointInfo contains detailed information about a service endpoint
type ServiceEndpointInfo struct {
	ServiceName  string
	InternalIP   string
	InternalPort int32
	PublicIP     string
	PublicPort   uint16
	Protocol     string
	ContainerID  string
	NetworkName  string
}

// Static errors for better error handling
var (
	ErrEmptyUUID         = errors.New("empty UUID found for enclave")
	ErrUUIDNotFound      = errors.New("UUID not found in enclave inspect output")
	ErrContainerNotFound = errors.New("container not found for service")
	ErrServiceNotFound   = errors.New("service not found in enclave")
	ErrEndpointNotFound  = errors.New("endpoint not found for service")
)

// Client defines the interface for execution layer operations
type Client interface {
	InspectService(ctx context.Context, enclaveName, service string) (*KurtosisServiceInspectResult, error)
	DoesEnclaveExist(ctx context.Context, enclaveName string) (bool, error)
	GetServiceStatus(ctx context.Context, enclaveName, serviceName string) (*ServiceStatus, error)

	// Enhanced service discovery methods
	GetServiceEndpoints(ctx context.Context, enclaveName string) (map[string]*ServiceEndpointInfo, error)
	GetELClientEndpoint(ctx context.Context, enclaveName string) (*ServiceEndpointInfo, error)
	GetCLClientEndpoint(ctx context.Context, enclaveName string) (*ServiceEndpointInfo, error)
	GetClientDataVolumes(ctx context.Context, enclaveName string) (map[string][]VolumeMount, error)
}

type client struct {
	log          logrus.FieldLogger
	dockerClient dockerclient.APIClient
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
	dockerCli, err := dockerclient.NewClientWithOpts(dockerclient.FromEnv, dockerclient.WithAPIVersionNegotiation())
	if err != nil {
		log.WithError(err).Fatal("Failed to create Docker client")
	}

	return &client{
		log:          log.WithField("package", "kurtosis"),
		dockerClient: dockerCli,
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

// findContainer finds the container ID for a service using Docker SDK
func (c *client) findContainer(ctx context.Context, enclaveUUID, serviceName string) (string, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "com.kurtosistech.enclave-id="+enclaveUUID)
	filterArgs.Add("label", "com.kurtosistech.id="+serviceName)

	containers, err := c.dockerClient.ContainerList(ctx, container.ListOptions{
		All:     true,
		Filters: filterArgs,
	})
	if err != nil {
		return "", fmt.Errorf("failed to list containers for service '%s': %w", serviceName, err)
	}

	if len(containers) == 0 {
		return "", nil // No container found
	}

	return containers[0].ID, nil
}

// inspectContainerState inspects the container state using Docker SDK
func (c *client) inspectContainerState(ctx context.Context, containerID string) (*dockerState, error) {
	containerJSON, err := c.dockerClient.ContainerInspect(ctx, containerID)
	if err != nil {
		return nil, fmt.Errorf("failed to inspect container '%s': %w", containerID, err)
	}

	// Convert Docker API state to our dockerState struct
	state := &dockerState{
		Status:     containerJSON.State.Status,
		Running:    containerJSON.State.Running,
		Paused:     containerJSON.State.Paused,
		Restarting: containerJSON.State.Restarting,
		Dead:       containerJSON.State.Dead,
		ExitCode:   containerJSON.State.ExitCode,
		Error:      containerJSON.State.Error,
		OOMKilled:  containerJSON.State.OOMKilled,
	}

	return state, nil
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

// GetServiceEndpoints returns detailed endpoint information for all services in an enclave
func (c *client) GetServiceEndpoints(ctx context.Context, enclaveName string) (map[string]*ServiceEndpointInfo, error) {
	c.log.WithField("enclave", enclaveName).Debug("Getting service endpoints")

	// Get the enclave UUID
	enclaveUUID, err := c.getEnclaveUUID(ctx, enclaveName)
	if err != nil {
		return nil, fmt.Errorf("failed to get enclave UUID: %w", err)
	}

	// List all containers in the enclave
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "com.kurtosistech.enclave-id="+enclaveUUID)

	containers, err := c.dockerClient.ContainerList(ctx, container.ListOptions{
		All:     false, // Only running containers
		Filters: filterArgs,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers for enclave '%s': %w", enclaveName, err)
	}

	// Build endpoint information for each service
	endpoints := make(map[string]*ServiceEndpointInfo, len(containers))
	for _, cont := range containers {
		serviceName, ok := cont.Labels["com.kurtosistech.id"]
		if !ok {
			continue // Skip containers without service label
		}

		// Get detailed container information
		containerJSON, err := c.dockerClient.ContainerInspect(ctx, cont.ID)
		if err != nil {
			c.log.WithFields(logrus.Fields{
				"container_id": cont.ID[:12],
				"service":      serviceName,
			}).WithError(err).Warn("Failed to inspect container for service endpoint")
			continue
		}

		// Extract network information
		var internalIP string
		var networkName string
		for netName, netInfo := range containerJSON.NetworkSettings.Networks {
			if netInfo.IPAddress != "" {
				internalIP = netInfo.IPAddress
				networkName = netName
				break
			}
		}

		// Create endpoint info (ports will be populated by specific methods if needed)
		endpoints[serviceName] = &ServiceEndpointInfo{
			ServiceName: serviceName,
			InternalIP:  internalIP,
			ContainerID: cont.ID,
			NetworkName: networkName,
		}
	}

	c.log.WithFields(logrus.Fields{
		"enclave":       enclaveName,
		"service_count": len(endpoints),
	}).Debug("Retrieved service endpoints")

	return endpoints, nil
}

// ClientEndpointConfig holds configuration for finding client endpoints
type ClientEndpointConfig struct {
	ServiceNames []string
	PortKeyword  string
	DefaultPort  int
	ClientType   string
}

// GetELClientEndpoint returns the execution layer client endpoint information
func (c *client) GetELClientEndpoint(ctx context.Context, enclaveName string) (*ServiceEndpointInfo, error) {
	config := ClientEndpointConfig{
		ServiceNames: []string{"el-1-geth", "el-client", "geth", "nethermind", "besu", "erigon", "reth"},
		PortKeyword:  "rpc",
		DefaultPort:  8545,
		ClientType:   "EL",
	}
	return c.findClientEndpoint(ctx, enclaveName, config)
}

// GetCLClientEndpoint returns the consensus layer client endpoint information
func (c *client) GetCLClientEndpoint(ctx context.Context, enclaveName string) (*ServiceEndpointInfo, error) {
	config := ClientEndpointConfig{
		ServiceNames: []string{"cl-1-lighthouse", "cl-client", "lighthouse", "prysm", "teku", "nimbus", "lodestar"},
		PortKeyword:  "http",
		DefaultPort:  4000,
		ClientType:   "CL",
	}
	return c.findClientEndpoint(ctx, enclaveName, config)
}

// GetClientDataVolumes returns volume mount information for client services
func (c *client) GetClientDataVolumes(ctx context.Context, enclaveName string) (map[string][]VolumeMount, error) {
	c.log.WithField("enclave", enclaveName).Debug("Getting client data volumes")

	// Get service endpoints to identify services
	endpoints, err := c.GetServiceEndpoints(ctx, enclaveName)
	if err != nil {
		return nil, fmt.Errorf("failed to get service endpoints: %w", err)
	}

	// Pre-allocate map
	serviceVolumes := make(map[string][]VolumeMount, len(endpoints))

	// Get volume information for each service
	for serviceName, endpoint := range endpoints {
		// Get container details
		containerJSON, err := c.dockerClient.ContainerInspect(ctx, endpoint.ContainerID)
		if err != nil {
			c.log.WithFields(logrus.Fields{
				"service":      serviceName,
				"container_id": endpoint.ContainerID[:12],
			}).WithError(err).Warn("Failed to inspect container for volume information")
			continue
		}

		// Convert Docker mounts to our VolumeMount structure
		volumes := make([]VolumeMount, 0, len(containerJSON.Mounts))
		for _, dockerMount := range containerJSON.Mounts {
			volumeMount := VolumeMount{
				Type:        string(dockerMount.Type),
				Source:      dockerMount.Source,
				Destination: dockerMount.Destination,
				Mode:        dockerMount.Mode,
				RW:          dockerMount.RW,
				Propagation: string(dockerMount.Propagation),
			}

			// For named volumes, extract additional information
			if dockerMount.Type == mount.TypeVolume {
				volumeMount.Name = dockerMount.Name
				volumeMount.Driver = dockerMount.Driver
			}

			volumes = append(volumes, volumeMount)
		}

		serviceVolumes[serviceName] = volumes
	}

	c.log.WithFields(logrus.Fields{
		"enclave":       enclaveName,
		"service_count": len(serviceVolumes),
	}).Debug("Retrieved client data volumes")

	return serviceVolumes, nil
}

// findClientEndpoint is a helper method to reduce code duplication between EL and CL endpoint discovery
func (c *client) findClientEndpoint(ctx context.Context, enclaveName string, config ClientEndpointConfig) (*ServiceEndpointInfo, error) {
	c.log.WithField("enclave", enclaveName).Debugf("Getting %s client endpoint", config.ClientType)

	endpoints, err := c.GetServiceEndpoints(ctx, enclaveName)
	if err != nil {
		return nil, fmt.Errorf("failed to get service endpoints: %w", err)
	}

	// Try to find service by common names
	for _, serviceName := range config.ServiceNames {
		if endpoint, exists := endpoints[serviceName]; exists {
			c.populateEndpointPorts(ctx, enclaveName, serviceName, endpoint, config)

			c.log.WithFields(logrus.Fields{
				"service":       serviceName,
				"internal_ip":   endpoint.InternalIP,
				"internal_port": endpoint.InternalPort,
				"public_port":   endpoint.PublicPort,
			}).Debugf("Found %s client endpoint", config.ClientType)

			return endpoint, nil
		}
	}

	return nil, fmt.Errorf("%w: no %s client service found in enclave '%s'", ErrServiceNotFound, config.ClientType, enclaveName)
}

// populateEndpointPorts populates port information for a service endpoint
func (c *client) populateEndpointPorts(
	ctx context.Context, enclaveName, serviceName string, endpoint *ServiceEndpointInfo, config ClientEndpointConfig,
) {
	// Try to get port information from service inspect
	serviceInfo, err := c.InspectService(ctx, enclaveName, serviceName)
	if err != nil {
		return // Skip port population if inspection fails
	}

	// Look for the specified port in internal ports
	for portName, portInfo := range serviceInfo.Ports {
		if c.isMatchingPort(portName, portInfo.Number, config) {
			if portInfo.Number >= 0 && portInfo.Number <= 2147483647 { // Check int32 range
				endpoint.InternalPort = int32(portInfo.Number) // #nosec G115 - checked above
			}
			endpoint.Protocol = "http"
			break
		}
	}

	// Look for public port mapping
	for portName, portInfo := range serviceInfo.PublicPorts {
		if c.isMatchingPort(portName, portInfo.Number, config) {
			if portInfo.Number >= 0 && portInfo.Number <= 65535 { // Check uint16 range
				endpoint.PublicPort = uint16(portInfo.Number) // #nosec G115 - checked above
			}
			endpoint.PublicIP = "127.0.0.1" // Kurtosis typically maps to localhost
			break
		}
	}
}

// isMatchingPort checks if a port matches the expected criteria
func (c *client) isMatchingPort(portName string, portNumber int, config ClientEndpointConfig) bool {
	return strings.Contains(strings.ToLower(portName), config.PortKeyword) || portNumber == config.DefaultPort
}

// Interface compliance check
var _ Client = (*client)(nil)
