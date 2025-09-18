package metrics_exporter

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/docker/go-connections/nat"
	"github.com/ethpandaops/syncoor/pkg/docker"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/network"
	"github.com/sirupsen/logrus"
)

// Static errors for better error handling
var (
	ErrNoContainerRunning = errors.New("no container is currently running")
	ErrNoConfigDirectory  = errors.New("no configuration directory available")
)

// Manager handles lifecycle management of the ethereum-metrics-exporter container
type Manager struct {
	dockerManager    *docker.ContainerManager
	configGenerator  *ConfigGenerator
	serviceDiscovery *ServiceDiscovery
	logger           logrus.FieldLogger
	containerID      string
	configDir        string
}

// Config contains configuration for metrics exporter deployment
type Config struct {
	Image         string // Default: "ethpandaops/ethereum-metrics-exporter:debian-latest"
	MetricsPort   int    // Default: 9090
	LogLevel      string // Default: "info"
	ConfigDir     string // Temporary config directory
	ELServiceName string // Execution layer service name (optional, for specific discovery)
	CLServiceName string // Consensus layer service name (optional, for specific discovery)
}

// NewManager creates a new Manager instance
func NewManager(
	dockerManager *docker.ContainerManager,
	configGenerator *ConfigGenerator,
	serviceDiscovery *ServiceDiscovery,
	logger logrus.FieldLogger,
) *Manager {
	return &Manager{
		dockerManager:    dockerManager,
		configGenerator:  configGenerator,
		serviceDiscovery: serviceDiscovery,
		logger:           logger.WithField("component", "metrics-manager"),
	}
}

// Start starts the metrics exporter container
func (m *Manager) Start(ctx context.Context, enclaveName string, config Config) error {
	m.logger.WithFields(logrus.Fields{
		"enclave": enclaveName,
		"image":   config.Image,
		"port":    config.MetricsPort,
	}).Info("Starting metrics exporter")

	// Always pull the latest version of the metrics exporter image
	if err := m.dockerManager.EnsureImageLatest(ctx, config.Image); err != nil {
		return fmt.Errorf("failed to pull latest metrics exporter image: %w", err)
	}

	// Prepare configuration
	configData, services, err := m.prepareConfiguration(ctx, enclaveName, config)
	if err != nil {
		return fmt.Errorf("failed to prepare configuration: %w", err)
	}

	// Setup and start container
	if err := m.setupAndStartContainer(ctx, config, configData, services.NetworkName); err != nil {
		return fmt.Errorf("failed to setup and start container: %w", err)
	}

	// Wait for container to become healthy and handle failures
	if err := m.waitForContainerHealth(ctx, configData); err != nil {
		return fmt.Errorf("metrics exporter container failed to start properly: %w", err)
	}

	return nil
}

// Stop stops and removes the metrics exporter container
func (m *Manager) Stop(ctx context.Context) error {
	m.logger.Debug("Stopping metrics exporter")

	if m.containerID != "" {
		if err := m.dockerManager.StopContainer(ctx, m.containerID); err != nil {
			m.logger.WithError(err).Error("Failed to stop metrics exporter container")
			return fmt.Errorf("failed to stop container: %w", err)
		}
		m.containerID = ""
	}

	// Clean up temporary configuration directory
	if m.configDir != "" {
		if err := os.RemoveAll(m.configDir); err != nil {
			m.logger.WithError(err).Warn("Failed to remove temporary config directory")
		}
		m.configDir = ""
	}

	m.logger.Info("Metrics exporter stopped successfully")
	return nil
}

// GetMetricsEndpoint returns the metrics endpoint URL
func (m *Manager) GetMetricsEndpoint() string {
	if m.containerID == "" {
		return ""
	}

	// For containers, we assume they're accessible via localhost
	// This could be enhanced to get the actual mapped port from Docker
	return "http://localhost:9090/metrics"
}

// IsRunning checks if the metrics exporter container is currently running
func (m *Manager) IsRunning(ctx context.Context) bool {
	if m.containerID == "" {
		return false
	}

	containerJSON, err := m.dockerManager.InspectContainer(ctx, m.containerID)
	if err != nil {
		m.logger.WithError(err).Debug("Failed to inspect container")
		return false
	}

	return containerJSON.State.Running
}

// Restart restarts the metrics exporter with new configuration
func (m *Manager) Restart(ctx context.Context, enclaveName string, config Config) error {
	m.logger.WithField("enclave", enclaveName).Info("Restarting metrics exporter")

	// Stop existing container
	if err := m.Stop(ctx); err != nil {
		return fmt.Errorf("failed to stop existing container: %w", err)
	}

	// Start with new configuration
	if err := m.Start(ctx, enclaveName, config); err != nil {
		return fmt.Errorf("failed to start container with new configuration: %w", err)
	}

	return nil
}

// GetDefaultConfig returns default configuration for metrics exporter
func (m *Manager) GetDefaultConfig() Config {
	return Config{
		Image:       "ethpandaops/ethereum-metrics-exporter:debian-latest",
		MetricsPort: 9090,
		LogLevel:    "info",
		ConfigDir:   "", // Will be auto-generated
	}
}

// GetContainerID returns the current container ID
func (m *Manager) GetContainerID() string {
	return m.containerID
}

// GetConfigDirectory returns the current configuration directory path
func (m *Manager) GetConfigDirectory() string {
	return m.configDir
}

// GetContainerInfo returns information about the running container
func (m *Manager) GetContainerInfo(ctx context.Context) (*docker.ContainerInfo, error) {
	if m.containerID == "" {
		return nil, fmt.Errorf("%w", ErrNoContainerRunning)
	}

	containerJSON, err := m.dockerManager.InspectContainer(ctx, m.containerID)
	if err != nil {
		return nil, fmt.Errorf("failed to inspect container: %w", err)
	}

	// Convert to ContainerInfo (simplified)
	info := &docker.ContainerInfo{
		ID:     m.containerID,
		Name:   containerJSON.Name,
		Status: containerJSON.State.Status,
		Image:  containerJSON.Config.Image,
		Labels: containerJSON.Config.Labels,
	}

	return info, nil
}

// UpdateConfiguration updates the configuration without restarting the container
// Note: This requires the metrics exporter to support configuration reloading
func (m *Manager) UpdateConfiguration(ctx context.Context, enclaveName string, config Config) error {
	m.logger.WithField("enclave", enclaveName).Info("Updating metrics exporter configuration")

	if m.configDir == "" {
		return fmt.Errorf("%w", ErrNoConfigDirectory)
	}

	// Discover services
	services, err := m.serviceDiscovery.DiscoverServices(ctx, enclaveName)
	if err != nil {
		return fmt.Errorf("failed to discover services: %w", err)
	}

	// Get monitored directories
	monitoredDirs, err := m.serviceDiscovery.GetMonitoredDirectories(ctx, services)
	if err != nil {
		return fmt.Errorf("failed to get monitored directories: %w", err)
	}

	// Prepare new configuration data
	configData := ConfigTemplateData{
		MetricsPort:     config.MetricsPort,
		ConsensusURL:    m.serviceDiscovery.BuildConsensusURL(services),
		ExecutionURL:    m.serviceDiscovery.BuildExecutionURL(services),
		MonitoredDirs:   monitoredDirs,
		LogLevel:        config.LogLevel,
		ELContainerName: services.ELEndpoint.ContainerID,
		CLContainerName: services.CLEndpoint.ContainerID,
	}

	// Validate and write new configuration
	if err := m.configGenerator.ValidateConfigData(configData); err != nil {
		return fmt.Errorf("invalid configuration data: %w", err)
	}

	_, err = m.configGenerator.WriteConfigFile(m.configDir, configData)
	if err != nil {
		return fmt.Errorf("failed to write updated configuration: %w", err)
	}

	m.logger.Info("Configuration updated successfully")
	// Note: The metrics exporter would need to support configuration reloading
	// for this to take effect without a restart

	return nil
}

// discoverServicesForConfig discovers services based on the configuration
func (m *Manager) discoverServicesForConfig(
	ctx context.Context, enclaveName string, config Config,
) (*DiscoveredServices, error) {
	if config.ELServiceName != "" && config.CLServiceName != "" {
		// Use specific service names
		return m.serviceDiscovery.DiscoverServicesWithNames(
			ctx, enclaveName, config.ELServiceName, config.CLServiceName,
		)
	}
	// Auto-discover services
	return m.serviceDiscovery.DiscoverServices(ctx, enclaveName)
}

// buildContainerConfig builds the Docker container configuration for the metrics exporter
func (m *Manager) buildContainerConfig(config Config, networkName string) docker.ContainerConfig {
	// Set up port mappings
	exposedPorts := nat.PortSet{
		nat.Port(fmt.Sprintf("%d/tcp", config.MetricsPort)): {},
	}

	portBindings := nat.PortMap{
		nat.Port(fmt.Sprintf("%d/tcp", config.MetricsPort)): []nat.PortBinding{
			{
				HostIP:   "0.0.0.0",
				HostPort: strconv.Itoa(config.MetricsPort),
			},
		},
	}

	// Set up volume binds
	binds := []string{
		// Mount configuration directory
		config.ConfigDir + ":/config:ro",
		// Mount Docker socket for container monitoring
		"/var/run/docker.sock:/var/run/docker.sock:ro",
		// Mount Docker volumes directory for disk usage monitoring
		"/var/lib/docker/volumes:/var/lib/docker/volumes:ro",
	}

	// Check if OrbStack volumes directory exists and mount it
	if homeDir, err := os.UserHomeDir(); err == nil {
		orbStackVolumes := filepath.Join(homeDir, "OrbStack", "docker", "volumes")
		if _, err := os.Stat(orbStackVolumes); err == nil {
			m.logger.WithField("orbstack_volumes", orbStackVolumes).Debug("Found OrbStack volumes, adding mount")
			binds = append(binds, orbStackVolumes+":/root/OrbStack/docker/volumes:ro")
		}
	}

	// Container labels for identification
	labels := map[string]string{
		"com.ethpandaops.syncoor":      "true",
		"com.ethpandaops.syncoor.role": "metrics-exporter",
		"com.ethpandaops.syncoor.type": "standalone",
	}

	// Configure container networks
	var networks map[string]*network.EndpointSettings
	if networkName != "" {
		// Add the container to the same network as EL/CL containers
		networks = map[string]*network.EndpointSettings{
			networkName: {},
		}
		m.logger.WithField("network", networkName).Debug("Configuring metrics exporter to use EL/CL network")
	}

	return docker.ContainerConfig{
		Image:         config.Image,
		Name:          "syncoor-metrics-exporter",
		Cmd:           []string{"--config", "/config/config.yaml"},
		Binds:         binds,
		ExposedPorts:  exposedPorts,
		PortBindings:  portBindings,
		Labels:        labels,
		Networks:      networks,
		RestartPolicy: container.RestartPolicy{Name: "no"},
	}
}

// prepareConfiguration prepares the configuration data for the metrics exporter
func (m *Manager) prepareConfiguration(ctx context.Context, enclaveName string, config Config) (ConfigTemplateData, *DiscoveredServices, error) {
	// Discover services
	services, err := m.discoverServicesForConfig(ctx, enclaveName, config)
	if err != nil {
		return ConfigTemplateData{}, nil, fmt.Errorf("failed to discover services: %w", err)
	}

	// Validate discovered endpoints
	if err := m.serviceDiscovery.ValidateEndpoints(ctx, services); err != nil {
		return ConfigTemplateData{}, nil, fmt.Errorf("service endpoint validation failed: %w", err)
	}

	// Get monitored directories
	monitoredDirs, err := m.serviceDiscovery.GetMonitoredDirectories(ctx, services)
	if err != nil {
		return ConfigTemplateData{}, nil, fmt.Errorf("failed to get monitored directories: %w", err)
	}

	// Prepare configuration data
	configData := ConfigTemplateData{
		MetricsPort:     config.MetricsPort,
		ConsensusURL:    m.serviceDiscovery.BuildConsensusURL(services),
		ExecutionURL:    m.serviceDiscovery.BuildExecutionURL(services),
		MonitoredDirs:   monitoredDirs,
		LogLevel:        config.LogLevel,
		ELContainerName: services.ELEndpoint.ContainerID,
		CLContainerName: services.CLEndpoint.ContainerID,
	}

	// Log configuration details for debugging
	m.logger.WithFields(logrus.Fields{
		"metrics_port":    configData.MetricsPort,
		"consensus_url":   configData.ConsensusURL,
		"execution_url":   configData.ExecutionURL,
		"monitored_dirs":  len(configData.MonitoredDirs),
		"log_level":       configData.LogLevel,
		"el_container_id": configData.ELContainerName,
		"cl_container_id": configData.CLContainerName,
		"config_dir":      config.ConfigDir,
	}).Debug("Metrics exporter configuration prepared")

	// Validate configuration data
	if err := m.configGenerator.ValidateConfigData(configData); err != nil {
		return ConfigTemplateData{}, nil, fmt.Errorf("invalid configuration data: %w", err)
	}

	return configData, services, nil
}

// setupAndStartContainer sets up configuration files and starts the container
func (m *Manager) setupAndStartContainer(ctx context.Context, config Config, configData ConfigTemplateData, networkName string) error {
	// Set up temporary configuration directory
	if config.ConfigDir == "" {
		tempDir, err := os.MkdirTemp("", "syncoor-metrics-exporter-*")
		if err != nil {
			return fmt.Errorf("failed to create temporary config directory: %w", err)
		}
		config.ConfigDir = tempDir
		m.configDir = tempDir
	}

	// Generate configuration file
	configPath, err := m.configGenerator.WriteConfigFile(config.ConfigDir, configData)
	if err != nil {
		return fmt.Errorf("failed to write configuration file: %w", err)
	}

	m.logger.WithField("config_path", configPath).Debug("Generated metrics exporter configuration")

	// Prepare Docker container configuration
	containerConfig := m.buildContainerConfig(config, networkName)

	// Log container configuration for debugging
	m.logger.WithFields(logrus.Fields{
		"container_image":  containerConfig.Image,
		"container_name":   containerConfig.Name,
		"port_bindings":    len(containerConfig.PortBindings),
		"volume_binds":     len(containerConfig.Binds),
		"command_args":     containerConfig.Cmd,
		"environment_vars": len(containerConfig.Env),
	}).Debug("Starting metrics exporter container with configuration")

	// Start the container
	containerInfo, err := m.dockerManager.StartContainer(ctx, containerConfig)
	if err != nil {
		return fmt.Errorf("failed to start metrics exporter container: %w", err)
	}

	m.containerID = containerInfo.ID
	return nil
}

// waitForContainerHealth waits for the container to become healthy and handles failures
func (m *Manager) waitForContainerHealth(ctx context.Context, configData ConfigTemplateData) error {
	// Wait for container to become healthy
	if err := m.dockerManager.WaitForHealthy(ctx, m.containerID, 60*time.Second); err != nil {
		m.logger.WithError(err).Error("Metrics exporter container failed to become healthy")

		// Get container logs for debugging
		if logs, logErr := m.dockerManager.GetContainerLogs(ctx, m.containerID, 50); logErr == nil {
			m.logger.WithField("container_logs", logs).Error("Metrics exporter container logs")
		} else {
			m.logger.WithError(logErr).Warn("Failed to retrieve container logs")
		}

		// Clean up the failed container
		if stopErr := m.dockerManager.StopContainer(ctx, m.containerID); stopErr != nil {
			m.logger.WithError(stopErr).Warn("Failed to stop failed metrics exporter container")
		}

		return fmt.Errorf("container health check failed: %w", err)
	}

	m.logger.WithFields(logrus.Fields{
		"container_id":   m.containerID[:12],
		"metrics_url":    m.GetMetricsEndpoint(),
		"consensus_url":  configData.ConsensusURL,
		"execution_url":  configData.ExecutionURL,
		"monitored_dirs": len(configData.MonitoredDirs),
	}).Info("Metrics exporter started successfully")

	return nil
}
