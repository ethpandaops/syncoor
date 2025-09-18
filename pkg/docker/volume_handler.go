package docker

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/moby/moby/client"
	"github.com/sirupsen/logrus"
)

const (
	// VolumeTypeVolume represents a named volume mount
	VolumeTypeVolume = "volume"
	// VolumeTypeBind represents a bind mount
	VolumeTypeBind = "bind"
	// VolumeTypeTmpfs represents a tmpfs mount
	VolumeTypeTmpfs = "tmpfs"
)

var (
	// ErrTmpfsNoHostPath indicates tmpfs volumes don't have host paths
	ErrTmpfsNoHostPath = errors.New("tmpfs volumes don't have host paths")
	// ErrUnknownVolumeType indicates an unknown volume type was encountered
	ErrUnknownVolumeType = errors.New("unknown volume type")
)

// VolumeMount represents a Docker volume mount
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

// VolumeHandler handles Docker volume operations
type VolumeHandler struct {
	dockerClient client.APIClient
	logger       logrus.FieldLogger
}

// NewVolumeHandler creates a new VolumeHandler instance
func NewVolumeHandler(dockerClient client.APIClient, logger logrus.FieldLogger) *VolumeHandler {
	return &VolumeHandler{
		dockerClient: dockerClient,
		logger:       logger,
	}
}

// DiscoverDataVolumes discovers all volume mounts for a given container
func (v *VolumeHandler) DiscoverDataVolumes(ctx context.Context, containerID string) ([]VolumeMount, error) {
	v.logger.WithField("container_id", containerID[:12]).Debug("Discovering data volumes")

	containerJSON, err := v.dockerClient.ContainerInspect(ctx, containerID)
	if err != nil {
		return nil, fmt.Errorf("failed to inspect container %s: %w", containerID, err)
	}

	// Pre-allocate slice with capacity
	volumes := make([]VolumeMount, 0, len(containerJSON.Mounts))

	// Process mounts from container inspection
	for _, mount := range containerJSON.Mounts {
		volumeMount := VolumeMount{
			Type:        string(mount.Type),
			Source:      mount.Source,
			Destination: mount.Destination,
			Mode:        mount.Mode,
			RW:          mount.RW,
			Propagation: string(mount.Propagation),
		}

		// For named volumes, extract the name
		if mount.Type == VolumeTypeVolume {
			volumeMount.Name = mount.Name
			volumeMount.Driver = mount.Driver
		}

		volumes = append(volumes, volumeMount)

		v.logger.WithFields(logrus.Fields{
			"type":        mount.Type,
			"source":      mount.Source,
			"destination": mount.Destination,
			"name":        mount.Name,
			"rw":          mount.RW,
		}).Debug("Discovered volume mount")
	}

	v.logger.WithFields(logrus.Fields{
		"container_id": containerID[:12],
		"volume_count": len(volumes),
	}).Debug("Volume discovery completed")

	return volumes, nil
}

// PrepareVolumeBinds converts VolumeMount structs to Docker bind strings
func (v *VolumeHandler) PrepareVolumeBinds(volumes []VolumeMount) []string {
	// Pre-allocate slice with capacity
	binds := make([]string, 0, len(volumes))

	for _, volume := range volumes {
		bindString := v.prepareVolumeBind(volume)
		if bindString != "" {
			binds = append(binds, bindString)
			v.logger.WithFields(logrus.Fields{
				"bind_string": bindString,
				"type":        volume.Type,
				"source":      volume.Source,
				"destination": volume.Destination,
			}).Debug("Prepared volume bind")
		}
	}

	return binds
}

// MountDockerSocket returns the Docker socket mount string for external container access
func (v *VolumeHandler) MountDockerSocket() string {
	return "/var/run/docker.sock:/var/run/docker.sock:ro"
}

// FilterDataVolumes filters volumes to only include data directories (typically database paths)
func (v *VolumeHandler) FilterDataVolumes(volumes []VolumeMount, dataPathPatterns ...string) []VolumeMount {
	if len(dataPathPatterns) == 0 {
		// Default patterns for Ethereum client data directories
		dataPathPatterns = []string{
			"/data",
			"/root/.ethereum",
			"/root/.local/share/lighthouse",
			"/opt/prysm",
			"/home/user/.local/share/teku",
			"/root/.local/share/nimbus",
			"/root/.local/share/lodestar",
		}
	}

	// Pre-allocate slice with reasonable capacity
	filtered := make([]VolumeMount, 0, len(volumes))
	for _, volume := range volumes {
		for _, pattern := range dataPathPatterns {
			if strings.Contains(volume.Destination, pattern) {
				filtered = append(filtered, volume)
				v.logger.WithFields(logrus.Fields{
					"destination": volume.Destination,
					"pattern":     pattern,
					"source":      volume.Source,
				}).Debug("Volume matches data pattern")
				break
			}
		}
	}

	return filtered
}

// GetVolumeHostPath returns the host path for a volume mount
func (v *VolumeHandler) GetVolumeHostPath(ctx context.Context, volumeMount VolumeMount) (string, error) {
	switch volumeMount.Type {
	case VolumeTypeBind:
		// For bind mounts, source is already the host path
		return volumeMount.Source, nil

	case VolumeTypeVolume:
		// For named volumes, we need to get the volume info
		volumeName := volumeMount.Name
		if volumeName == "" {
			volumeName = volumeMount.Source
		}

		volumeInfo, err := v.dockerClient.VolumeInspect(ctx, volumeName)
		if err != nil {
			return "", fmt.Errorf("failed to inspect volume %s: %w", volumeName, err)
		}

		return volumeInfo.Mountpoint, nil

	case VolumeTypeTmpfs:
		// tmpfs volumes don't have a host path
		return "", fmt.Errorf("%w", ErrTmpfsNoHostPath)

	default:
		return "", fmt.Errorf("%w: %s", ErrUnknownVolumeType, volumeMount.Type)
	}
}

// prepareVolumeBind creates a bind string for a single volume mount
func (v *VolumeHandler) prepareVolumeBind(volume VolumeMount) string {
	switch volume.Type {
	case VolumeTypeBind:
		return v.prepareBindMount(volume)
	case VolumeTypeVolume:
		return v.prepareVolumeMount(volume)
	case VolumeTypeTmpfs:
		return v.prepareTmpfsMount(volume)
	default:
		v.logger.WithField("type", volume.Type).Warn("Unknown volume type, skipping")
		return ""
	}
}

// prepareBindMount formats bind mount strings
func (v *VolumeHandler) prepareBindMount(volume VolumeMount) string {
	// Format: source:destination:options
	bindString := fmt.Sprintf("%s:%s", volume.Source, volume.Destination)

	options := v.buildMountOptions(volume)
	if volume.Propagation != "" {
		options = append(options, volume.Propagation)
	}

	if len(options) > 0 {
		bindString = fmt.Sprintf("%s:%s", bindString, strings.Join(options, ","))
	}

	return bindString
}

// prepareVolumeMount formats volume mount strings
func (v *VolumeHandler) prepareVolumeMount(volume VolumeMount) string {
	// Format: volume_name:destination:options
	source := volume.Source
	if volume.Name != "" {
		source = volume.Name
	}

	bindString := fmt.Sprintf("%s:%s", source, volume.Destination)

	options := v.buildMountOptions(volume)
	if len(options) > 0 {
		bindString = fmt.Sprintf("%s:%s", bindString, strings.Join(options, ","))
	}

	return bindString
}

// prepareTmpfsMount formats tmpfs mount strings
func (v *VolumeHandler) prepareTmpfsMount(volume VolumeMount) string {
	// tmpfs mounts don't need source, just destination
	return volume.Destination
}

// buildMountOptions builds common mount options for volumes
func (v *VolumeHandler) buildMountOptions(volume VolumeMount) []string {
	var options []string
	if !volume.RW {
		options = append(options, "ro")
	}
	if volume.Mode != "" {
		options = append(options, volume.Mode)
	}
	return options
}
