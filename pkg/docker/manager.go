package docker

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/docker/go-connections/nat"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
	"github.com/sirupsen/logrus"
)

var (
	ErrContainerNotHealthy = errors.New("container did not become healthy within timeout")
	ErrContainerNotRunning = errors.New("container is not running")
)

// Port represents a port mapping
type Port struct {
	PrivatePort int
	PublicPort  string
	Type        string
}

// ContainerJSON represents a Docker container's detailed information
type ContainerJSON struct {
	Name            string
	State           ContainerState
	Config          DockerContainerConfig
	NetworkSettings *ContainerNetworkSettings
}

// ContainerState represents the state of a container
type ContainerState struct {
	Running bool
	Status  string
	Health  *ContainerHealth
}

// ContainerHealth represents container health information
type ContainerHealth struct {
	Status string
}

// DockerContainerConfig represents container configuration
type DockerContainerConfig struct {
	Image  string
	Labels map[string]string
}

// ContainerNetworkSettings represents network settings
type ContainerNetworkSettings struct {
	Ports map[nat.Port][]nat.PortBinding
}

// ContainerConfig defines the configuration for starting a container
type ContainerConfig struct {
	Image         string
	Name          string
	Env           []string
	Binds         []string
	PortBindings  nat.PortMap
	ExposedPorts  nat.PortSet
	Cmd           []string
	WorkingDir    string
	Labels        map[string]string
	Networks      map[string]*network.EndpointSettings
	RestartPolicy container.RestartPolicy
}

// ContainerInfo contains information about a running container
type ContainerInfo struct {
	ID       string
	Name     string
	Status   string
	Image    string
	Ports    []Port
	Labels   map[string]string
	Networks map[string]*network.EndpointSettings
}

// ContainerManager handles Docker container operations
type ContainerManager struct {
	dockerClient client.APIClient
	logger       logrus.FieldLogger
}

// NewClient creates a new Docker client with default settings
func NewClient() (client.APIClient, error) {
	dockerClient, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}
	return dockerClient, nil
}

// NewContainerManager creates a new ContainerManager instance
func NewContainerManager(dockerClient client.APIClient, logger logrus.FieldLogger) *ContainerManager {
	return &ContainerManager{
		dockerClient: dockerClient,
		logger:       logger,
	}
}

// StartContainer starts a new container with the given configuration
func (m *ContainerManager) StartContainer(ctx context.Context, config ContainerConfig) (*ContainerInfo, error) {
	m.logger.WithField("image", config.Image).Debug("Starting container")

	// Create container configuration
	containerConfig := &container.Config{
		Image:        config.Image,
		Env:          config.Env,
		ExposedPorts: config.ExposedPorts,
		Cmd:          config.Cmd,
		WorkingDir:   config.WorkingDir,
		Labels:       config.Labels,
	}

	// Create host configuration
	hostConfig := &container.HostConfig{
		Binds:         config.Binds,
		PortBindings:  config.PortBindings,
		RestartPolicy: config.RestartPolicy,
	}

	// Create network configuration
	networkConfig := &network.NetworkingConfig{
		EndpointsConfig: config.Networks,
	}

	// Create the container
	resp, err := m.dockerClient.ContainerCreate(
		ctx,
		containerConfig,
		hostConfig,
		networkConfig,
		nil,
		config.Name,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create container: %w", err)
	}

	// Start the container
	if err := m.dockerClient.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return nil, fmt.Errorf("failed to start container: %w", err)
	}

	// Get container information
	containerInfo, err := m.InspectContainer(ctx, resp.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to inspect created container: %w", err)
	}

	info := &ContainerInfo{
		ID:     resp.ID,
		Name:   containerInfo.Name,
		Status: containerInfo.State.Status,
		Image:  containerInfo.Config.Image,
		Labels: containerInfo.Config.Labels,
	}

	// Extract port information
	if containerInfo.NetworkSettings != nil {
		for port, bindings := range containerInfo.NetworkSettings.Ports {
			for _, binding := range bindings {
				info.Ports = append(info.Ports, Port{
					PrivatePort: port.Int(),
					PublicPort:  binding.HostPort,
					Type:        port.Proto(),
				})
			}
		}
	}

	m.logger.WithFields(logrus.Fields{
		"container_id": resp.ID[:12],
		"name":         config.Name,
		"image":        config.Image,
	}).Info("Container started successfully")

	return info, nil
}

// StopContainer stops a running container
func (m *ContainerManager) StopContainer(ctx context.Context, containerID string) error {
	m.logger.WithField("container_id", containerID[:12]).Debug("Stopping container")

	timeout := int(30) // 30 seconds
	if err := m.dockerClient.ContainerStop(ctx, containerID, container.StopOptions{Timeout: &timeout}); err != nil {
		return fmt.Errorf("failed to stop container %s: %w", containerID, err)
	}

	// Remove the container
	if err := m.dockerClient.ContainerRemove(ctx, containerID, container.RemoveOptions{
		RemoveVolumes: true,
		Force:         true,
	}); err != nil {
		return fmt.Errorf("failed to remove container %s: %w", containerID, err)
	}

	m.logger.WithField("container_id", containerID[:12]).Info("Container stopped and removed")
	return nil
}

// InspectContainer returns detailed information about a container
func (m *ContainerManager) InspectContainer(ctx context.Context, containerID string) (*ContainerJSON, error) {
	containerJSON, err := m.dockerClient.ContainerInspect(ctx, containerID)
	if err != nil {
		return nil, fmt.Errorf("failed to inspect container %s: %w", containerID, err)
	}

	// Convert to our custom type (simplified conversion)
	result := &ContainerJSON{
		Name: containerJSON.Name,
		State: ContainerState{
			Status: containerJSON.State.Status,
		},
		Config: DockerContainerConfig{
			Image:  containerJSON.Config.Image,
			Labels: containerJSON.Config.Labels,
		},
	}

	// Handle network settings if available
	if containerJSON.NetworkSettings != nil {
		result.NetworkSettings = &ContainerNetworkSettings{
			Ports: containerJSON.NetworkSettings.Ports,
		}
	}

	// Handle health status
	if containerJSON.State.Health != nil {
		result.State.Health = &ContainerHealth{
			Status: containerJSON.State.Health.Status,
		}
	}

	result.State.Running = containerJSON.State.Running

	return result, nil
}

// WaitForHealthy waits for a container to become healthy within the specified timeout
func (m *ContainerManager) WaitForHealthy(ctx context.Context, containerID string, timeout time.Duration) error {
	m.logger.WithField("container_id", containerID[:12]).Debug("Waiting for container to become healthy")

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("%w: container %s within %v", ErrContainerNotHealthy, containerID, timeout)
		case <-ticker.C:
			containerJSON, err := m.InspectContainer(ctx, containerID)
			if err != nil {
				return fmt.Errorf("failed to inspect container during health check: %w", err)
			}

			// Check if container is running
			if !containerJSON.State.Running {
				return fmt.Errorf("%w: container %s (status: %s)", ErrContainerNotRunning, containerID, containerJSON.State.Status)
			}

			// If container has health check, wait for it to be healthy
			if containerJSON.State.Health != nil {
				if containerJSON.State.Health.Status == "healthy" {
					m.logger.WithField("container_id", containerID[:12]).Debug("Container is healthy")
					return nil
				}
				continue
			}

			// If no health check, consider running as healthy
			m.logger.WithField("container_id", containerID[:12]).Debug("Container is running (no health check)")
			return nil
		}
	}
}
