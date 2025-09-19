package metrics_exporter

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/ethpandaops/syncoor/pkg/docker"
	"github.com/ethpandaops/syncoor/pkg/kurtosis"
	"github.com/sirupsen/logrus"
)

const (
	// ProtocolHTTP is the HTTP protocol identifier
	ProtocolHTTP = "http"
)

// Static errors for better error handling
var (
	ErrEnclaveNotFound          = errors.New("enclave does not exist")
	ErrEndpointNil              = errors.New("endpoint is nil")
	ErrEndpointEmptyServiceName = errors.New("endpoint has empty service name")
	ErrEndpointEmptyInternalIP  = errors.New("endpoint has empty internal IP")
	ErrEndpointInvalidPort      = errors.New("endpoint has invalid internal port")
	ErrEndpointEmptyContainerID = errors.New("endpoint has empty container ID")
	ErrContainerNotRunning      = errors.New("container is not running")
	ErrServiceNotFound          = errors.New("service not found in enclave")
)

// ServiceDiscovery handles discovery of EL/CL services and their connection details
type ServiceDiscovery struct {
	kurtosisClient kurtosis.Client
	dockerManager  *docker.ContainerManager
	volumeHandler  *docker.VolumeHandler
	logger         logrus.FieldLogger
}

// DiscoveredServices contains all discovered service information needed for metrics exporter
type DiscoveredServices struct {
	ELEndpoint  *kurtosis.ServiceEndpointInfo
	CLEndpoint  *kurtosis.ServiceEndpointInfo
	DataVolumes map[string][]docker.VolumeMount
	NetworkName string
	EnclaveName string
}

// NewServiceDiscovery creates a new ServiceDiscovery instance
func NewServiceDiscovery(
	kurtosisClient kurtosis.Client,
	dockerManager *docker.ContainerManager,
	volumeHandler *docker.VolumeHandler,
	logger logrus.FieldLogger,
) *ServiceDiscovery {
	return &ServiceDiscovery{
		kurtosisClient: kurtosisClient,
		dockerManager:  dockerManager,
		volumeHandler:  volumeHandler,
		logger:         logger.WithField("component", "service-discovery"),
	}
}

// DiscoverServices discovers all services and their configuration for the metrics exporter
func (s *ServiceDiscovery) DiscoverServices(ctx context.Context, enclaveName string) (*DiscoveredServices, error) {
	s.logger.WithField("enclave", enclaveName).Info("Starting service discovery")

	// Verify enclave exists
	exists, err := s.kurtosisClient.DoesEnclaveExist(ctx, enclaveName)
	if err != nil {
		return nil, fmt.Errorf("failed to check enclave existence: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("%w: '%s'", ErrEnclaveNotFound, enclaveName)
	}

	// Discover EL client endpoint
	elEndpoint, err := s.kurtosisClient.GetELClientEndpoint(ctx, enclaveName)
	if err != nil {
		return nil, fmt.Errorf("failed to discover EL client endpoint: %w", err)
	}

	// Discover CL client endpoint
	clEndpoint, err := s.kurtosisClient.GetCLClientEndpoint(ctx, enclaveName)
	if err != nil {
		return nil, fmt.Errorf("failed to discover CL client endpoint: %w", err)
	}

	// Special handling for Prysm - use HTTP port (3500) instead of RPC port (4000)
	if s.isPrysmClient(clEndpoint.ServiceName) {
		clEndpoint.InternalPort = 3500 // Prysm HTTP API port
		clEndpoint.Protocol = ProtocolHTTP
		s.logger.WithFields(logrus.Fields{
			"service": clEndpoint.ServiceName,
			"port":    clEndpoint.InternalPort,
		}).Debug("Using Prysm HTTP port for metrics")
	}

	// Get data volumes for both clients
	kurtosisDataVolumes, err := s.kurtosisClient.GetClientDataVolumes(ctx, enclaveName)
	if err != nil {
		return nil, fmt.Errorf("failed to discover client data volumes: %w", err)
	}

	// Convert kurtosis VolumeMount to docker VolumeMount and filter data volumes
	filteredVolumes := s.convertAndFilterDataVolumes(kurtosisDataVolumes)

	// Determine network name from EL endpoint (fallback to CL if needed)
	networkName := elEndpoint.NetworkName
	if networkName == "" {
		networkName = clEndpoint.NetworkName
	}

	discovered := &DiscoveredServices{
		ELEndpoint:  elEndpoint,
		CLEndpoint:  clEndpoint,
		DataVolumes: filteredVolumes,
		NetworkName: networkName,
		EnclaveName: enclaveName,
	}

	s.logger.WithFields(logrus.Fields{
		"enclave":         enclaveName,
		"el_service":      elEndpoint.ServiceName,
		"el_internal_url": s.buildInternalURL(elEndpoint),
		"cl_service":      clEndpoint.ServiceName,
		"cl_internal_url": s.buildInternalURL(clEndpoint),
		"network":         networkName,
		"volume_count":    len(filteredVolumes),
	}).Info("Service discovery completed successfully")

	return discovered, nil
}

// DiscoverServicesWithNames discovers services using specific service names
func (s *ServiceDiscovery) DiscoverServicesWithNames(
	ctx context.Context, enclaveName, elServiceName, clServiceName string,
) (*DiscoveredServices, error) {
	s.logger.WithFields(logrus.Fields{
		"enclave":    enclaveName,
		"el_service": elServiceName,
		"cl_service": clServiceName,
	}).Info("Starting service discovery with specific names")

	// Get all service endpoints
	endpoints, err := s.kurtosisClient.GetServiceEndpoints(ctx, enclaveName)
	if err != nil {
		return nil, fmt.Errorf("failed to get service endpoints: %w", err)
	}

	// Find EL endpoint by name
	elEndpoint, exists := endpoints[elServiceName]
	if !exists {
		return nil, fmt.Errorf("%w: EL service '%s'", ErrServiceNotFound, elServiceName)
	}

	// Set default ports if not populated
	if elEndpoint.InternalPort == 0 {
		elEndpoint.InternalPort = 8545 // Default EL RPC port
		elEndpoint.Protocol = ProtocolHTTP
	}

	// Find CL endpoint by name
	clEndpoint, exists := endpoints[clServiceName]
	if !exists {
		return nil, fmt.Errorf("%w: CL service '%s'", ErrServiceNotFound, clServiceName)
	}

	// Set default ports if not populated
	if clEndpoint.InternalPort == 0 {
		// Special handling for Prysm - use HTTP port (3500) instead of RPC port (4000)
		if s.isPrysmClient(clServiceName) {
			clEndpoint.InternalPort = 3500 // Prysm HTTP API port
		} else {
			clEndpoint.InternalPort = 4000 // Default CL beacon port
		}
		clEndpoint.Protocol = ProtocolHTTP
	}

	// Get data volumes for both clients
	kurtosisDataVolumes, err := s.kurtosisClient.GetClientDataVolumes(ctx, enclaveName)
	if err != nil {
		return nil, fmt.Errorf("failed to discover client data volumes: %w", err)
	}

	// Convert kurtosis VolumeMount to docker VolumeMount and filter data volumes
	filteredVolumes := s.convertAndFilterDataVolumes(kurtosisDataVolumes)

	// Determine network name from EL endpoint (fallback to CL if needed)
	networkName := elEndpoint.NetworkName
	if networkName == "" {
		networkName = clEndpoint.NetworkName
	}

	discovered := &DiscoveredServices{
		ELEndpoint:  elEndpoint,
		CLEndpoint:  clEndpoint,
		DataVolumes: filteredVolumes,
		NetworkName: networkName,
		EnclaveName: enclaveName,
	}

	s.logger.WithFields(logrus.Fields{
		"enclave":         enclaveName,
		"el_service":      elEndpoint.ServiceName,
		"el_internal_url": s.buildInternalURL(elEndpoint),
		"cl_service":      clEndpoint.ServiceName,
		"cl_internal_url": s.buildInternalURL(clEndpoint),
		"network":         networkName,
		"volume_count":    len(filteredVolumes),
	}).Info("Service discovery completed successfully")

	return discovered, nil
}

// ValidateEndpoints validates that the discovered endpoints are accessible
func (s *ServiceDiscovery) ValidateEndpoints(ctx context.Context, services *DiscoveredServices) error {
	s.logger.WithField("enclave", services.EnclaveName).Debug("Validating discovered endpoints")

	// Validate EL endpoint
	if err := s.validateEndpoint(ctx, services.ELEndpoint, "EL"); err != nil {
		return fmt.Errorf("EL endpoint validation failed: %w", err)
	}

	// Validate CL endpoint
	if err := s.validateEndpoint(ctx, services.CLEndpoint, "CL"); err != nil {
		return fmt.Errorf("CL endpoint validation failed: %w", err)
	}

	s.logger.WithField("enclave", services.EnclaveName).Debug("Endpoint validation completed successfully")
	return nil
}

// MonitorServiceChanges monitors for changes in service configuration
func (s *ServiceDiscovery) MonitorServiceChanges(ctx context.Context, enclaveName string) (<-chan *DiscoveredServices, error) {
	s.logger.WithField("enclave", enclaveName).Debug("Starting service monitoring")

	// Create a channel for service updates
	updatesChan := make(chan *DiscoveredServices, 1)

	// For now, we'll implement a simple approach that doesn't actively monitor
	// This can be enhanced later with Docker events or periodic polling
	go func() {
		defer close(updatesChan)

		// Perform initial discovery
		services, err := s.DiscoverServices(ctx, enclaveName)
		if err != nil {
			s.logger.WithError(err).Error("Failed to perform initial service discovery")
			return
		}

		// Send initial discovery result
		select {
		case updatesChan <- services:
		case <-ctx.Done():
			return
		}

		// Wait for context cancellation
		<-ctx.Done()
	}()

	return updatesChan, nil
}

// GetMonitoredDirectories returns a list of directories that should be monitored for disk usage
func (s *ServiceDiscovery) GetMonitoredDirectories(ctx context.Context, services *DiscoveredServices) ([]string, error) {
	s.logger.WithField("enclave", services.EnclaveName).Debug("Getting monitored directories")

	var directories []string

	// Collect directories from all data volumes
	for serviceName, volumes := range services.DataVolumes {
		for _, volume := range volumes {
			// Get the host path for this volume
			hostPath, err := s.volumeHandler.GetVolumeHostPath(ctx, volume)
			if err != nil {
				s.logger.WithFields(logrus.Fields{
					"service":     serviceName,
					"volume_type": volume.Type,
					"destination": volume.Destination,
				}).WithError(err).Warn("Failed to get host path for volume, skipping")
				continue
			}

			// Skip if we already have this directory
			found := false
			for _, existingDir := range directories {
				if existingDir == hostPath {
					found = true
					break
				}
			}

			if !found {
				directories = append(directories, hostPath)
			}
		}
	}

	s.logger.WithFields(logrus.Fields{
		"enclave":     services.EnclaveName,
		"directories": directories,
	}).Debug("Collected monitored directories")

	return directories, nil
}

// BuildConsensusURL builds the consensus client URL for metrics exporter configuration
func (s *ServiceDiscovery) BuildConsensusURL(services *DiscoveredServices) string {
	if services.CLEndpoint == nil {
		return ""
	}
	return s.buildInternalURL(services.CLEndpoint)
}

// BuildExecutionURL builds the execution client URL for metrics exporter configuration
func (s *ServiceDiscovery) BuildExecutionURL(services *DiscoveredServices) string {
	if services.ELEndpoint == nil {
		return ""
	}
	return s.buildInternalURL(services.ELEndpoint)
}

// GetClientServiceNames returns the names of discovered client services
func (s *ServiceDiscovery) GetClientServiceNames(services *DiscoveredServices) []string {
	var serviceNames []string

	if services.ELEndpoint != nil && services.ELEndpoint.ServiceName != "" {
		serviceNames = append(serviceNames, services.ELEndpoint.ServiceName)
	}

	if services.CLEndpoint != nil && services.CLEndpoint.ServiceName != "" {
		serviceNames = append(serviceNames, services.CLEndpoint.ServiceName)
	}

	return serviceNames
}

// IsEthereumDataDirectory checks if a directory path is likely an Ethereum client data directory
func (s *ServiceDiscovery) IsEthereumDataDirectory(path string) bool {
	path = strings.ToLower(path)

	ethereumPaths := []string{
		"/data",
		"/root/.ethereum",
		"/root/.local/share/lighthouse",
		"/opt/prysm",
		"/home/user/.local/share/teku",
		"/root/.local/share/nimbus",
		"/root/.local/share/lodestar",
		"chaindata",
		"beacon",
		"validator",
	}

	for _, ethPath := range ethereumPaths {
		if strings.Contains(path, ethPath) {
			return true
		}
	}

	return false
}

// buildInternalURL constructs the internal URL for a service endpoint
func (s *ServiceDiscovery) buildInternalURL(endpoint *kurtosis.ServiceEndpointInfo) string {
	if endpoint.InternalIP == "" || endpoint.InternalPort == 0 {
		return ""
	}

	protocol := endpoint.Protocol
	if protocol == "" {
		protocol = ProtocolHTTP
	}

	return fmt.Sprintf("%s://%s:%d", protocol, endpoint.InternalIP, endpoint.InternalPort)
}

// validateEndpoint validates that an endpoint is accessible
func (s *ServiceDiscovery) validateEndpoint(ctx context.Context, endpoint *kurtosis.ServiceEndpointInfo, clientType string) error {
	if endpoint == nil {
		return fmt.Errorf("%w: %s", ErrEndpointNil, clientType)
	}

	if endpoint.ServiceName == "" {
		return fmt.Errorf("%w: %s", ErrEndpointEmptyServiceName, clientType)
	}

	if endpoint.InternalIP == "" {
		return fmt.Errorf("%w: %s", ErrEndpointEmptyInternalIP, clientType)
	}

	if endpoint.InternalPort == 0 {
		return fmt.Errorf("%w: %s", ErrEndpointInvalidPort, clientType)
	}

	if endpoint.ContainerID == "" {
		return fmt.Errorf("%w: %s", ErrEndpointEmptyContainerID, clientType)
	}

	// Verify the container is running
	containerInfo, err := s.dockerManager.InspectContainer(ctx, endpoint.ContainerID)
	if err != nil {
		return fmt.Errorf("failed to inspect %s container: %w", clientType, err)
	}

	if !containerInfo.State.Running {
		return fmt.Errorf("%w: %s (status: %s)", ErrContainerNotRunning, clientType, containerInfo.State.Status)
	}

	s.logger.WithFields(logrus.Fields{
		"client_type":  clientType,
		"service":      endpoint.ServiceName,
		"container_id": endpoint.ContainerID[:12],
		"internal_url": s.buildInternalURL(endpoint),
	}).Debug("Endpoint validation passed")

	return nil
}

// convertAndFilterDataVolumes converts kurtosis VolumeMount to docker VolumeMount and filters data directories
func (s *ServiceDiscovery) convertAndFilterDataVolumes(kurtosisVolumes map[string][]kurtosis.VolumeMount) map[string][]docker.VolumeMount {
	filtered := make(map[string][]docker.VolumeMount, len(kurtosisVolumes))

	for serviceName, kurtosisVols := range kurtosisVolumes {
		// Convert kurtosis VolumeMount to docker VolumeMount
		dockerVols := s.convertVolumeMounts(kurtosisVols)

		// Use the docker volume handler to filter data volumes
		dataVolumes := s.volumeHandler.FilterDataVolumes(dockerVols)
		if len(dataVolumes) > 0 {
			filtered[serviceName] = dataVolumes

			s.logger.WithFields(logrus.Fields{
				"service":    serviceName,
				"total_vols": len(kurtosisVols),
				"data_vols":  len(dataVolumes),
			}).Debug("Filtered data volumes for service")
		}
	}

	return filtered
}

// convertVolumeMounts converts kurtosis VolumeMount slice to docker VolumeMount slice
func (s *ServiceDiscovery) convertVolumeMounts(kurtosisVols []kurtosis.VolumeMount) []docker.VolumeMount {
	dockerVols := make([]docker.VolumeMount, len(kurtosisVols))

	for i, kVol := range kurtosisVols {
		dockerVols[i] = docker.VolumeMount{
			Type:        kVol.Type,
			Name:        kVol.Name,
			Source:      kVol.Source,
			Destination: kVol.Destination,
			Driver:      kVol.Driver,
			Mode:        kVol.Mode,
			RW:          kVol.RW,
			Propagation: kVol.Propagation,
		}
	}

	return dockerVols
}

// isPrysmClient checks if a service name indicates it's a Prysm consensus client
func (s *ServiceDiscovery) isPrysmClient(serviceName string) bool {
	// Check if the service name contains "prysm" (case-insensitive)
	return strings.Contains(strings.ToLower(serviceName), "prysm")
}
