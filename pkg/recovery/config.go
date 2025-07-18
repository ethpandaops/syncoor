package recovery

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/sirupsen/logrus"
)

// ConfigMatcher handles configuration matching logic for recovery operations
type ConfigMatcher struct {
	log logrus.FieldLogger
}

// NewConfigMatcher creates a new configuration matcher
func NewConfigMatcher(log logrus.FieldLogger) *ConfigMatcher {
	return &ConfigMatcher{
		log: log.WithField("component", "config_matcher"),
	}
}

// MatchesConfig checks if two configurations are compatible for recovery
func (cm *ConfigMatcher) MatchesConfig(existing, desired *Config) bool {
	// Exact matches required for core identifiers
	if existing.Network != desired.Network {
		cm.log.WithFields(logrus.Fields{
			"existing_network": existing.Network,
			"desired_network":  desired.Network,
		}).Debug("Network mismatch")
		return false
	}

	if existing.ELClient != desired.ELClient {
		cm.log.WithFields(logrus.Fields{
			"existing_el": existing.ELClient,
			"desired_el":  desired.ELClient,
		}).Debug("EL client mismatch")
		return false
	}

	if existing.CLClient != desired.CLClient {
		cm.log.WithFields(logrus.Fields{
			"existing_cl": existing.CLClient,
			"desired_cl":  desired.CLClient,
		}).Debug("CL client mismatch")
		return false
	}

	// Image matching (if specified in desired config)
	if desired.ELImage != "" && existing.ELImage != desired.ELImage {
		cm.log.WithFields(logrus.Fields{
			"existing_el_image": existing.ELImage,
			"desired_el_image":  desired.ELImage,
		}).Debug("EL image mismatch")
		return false
	}

	if desired.CLImage != "" && existing.CLImage != desired.CLImage {
		cm.log.WithFields(logrus.Fields{
			"existing_cl_image": existing.CLImage,
			"desired_cl_image":  desired.CLImage,
		}).Debug("CL image mismatch")
		return false
	}

	// Args compatibility - check if desired args are a subset of existing args
	if !cm.argsCompatible(existing.ELExtraArgs, desired.ELExtraArgs) {
		cm.log.WithFields(logrus.Fields{
			"existing_el_args": existing.ELExtraArgs,
			"desired_el_args":  desired.ELExtraArgs,
		}).Debug("EL args incompatible")
		return false
	}

	if !cm.argsCompatible(existing.CLExtraArgs, desired.CLExtraArgs) {
		cm.log.WithFields(logrus.Fields{
			"existing_cl_args": existing.CLExtraArgs,
			"desired_cl_args":  desired.CLExtraArgs,
		}).Debug("CL args incompatible")
		return false
	}

	cm.log.Debug("Configuration match successful")
	return true
}

// GenerateEnclavePattern generates the expected enclave name from configuration
func (cm *ConfigMatcher) GenerateEnclavePattern(cfg *Config) string {
	// Use the same pattern as the existing sync service
	enclaveName := fmt.Sprintf("sync-test-%s-%s-%s", cfg.Network, cfg.ELClient, cfg.CLClient)

	cm.log.WithFields(logrus.Fields{
		"network":      cfg.Network,
		"el_client":    cfg.ELClient,
		"cl_client":    cfg.CLClient,
		"enclave_name": enclaveName,
	}).Debug("Generated enclave name")

	return enclaveName
}

// ParseEnclaveConfig attempts to parse configuration from an enclave name
func (cm *ConfigMatcher) ParseEnclaveConfig(enclaveName string) (*Config, error) {
	// Pattern: sync-test-{network}-{elclient}-{clclient}
	pattern := `^sync-test-([^-]+)-([^-]+)-(.+)$`
	re := regexp.MustCompile(pattern)

	matches := re.FindStringSubmatch(enclaveName)
	if len(matches) != 4 {
		return nil, fmt.Errorf("enclave name does not match expected pattern: %s", enclaveName)
	}

	config := &Config{
		Network:     matches[1],
		ELClient:    matches[2],
		CLClient:    matches[3],
		EnclaveName: enclaveName,
	}

	cm.log.WithFields(logrus.Fields{
		"enclave_name": enclaveName,
		"network":      config.Network,
		"el_client":    config.ELClient,
		"cl_client":    config.CLClient,
	}).Debug("Parsed enclave configuration")

	return config, nil
}

// argsCompatible checks if desired args are compatible with existing args
// Returns true if desired args are a subset of existing args or if both are empty
func (cm *ConfigMatcher) argsCompatible(existing, desired []string) bool {
	if len(desired) == 0 {
		return true // No specific args required
	}

	if len(existing) == 0 {
		return false // Desired args specified but existing has none
	}

	// Check if all desired args are present in existing args
	existingSet := make(map[string]bool, len(existing))
	for _, arg := range existing {
		existingSet[strings.TrimSpace(arg)] = true
	}

	for _, desiredArg := range desired {
		if !existingSet[strings.TrimSpace(desiredArg)] {
			return false
		}
	}

	return true
}
