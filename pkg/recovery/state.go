package recovery

import (
	"context"
	"fmt"

	"github.com/ethpandaops/syncoor/pkg/kurtosis"
	"github.com/sirupsen/logrus"
)

// StateValidator handles enclave state validation for recovery operations
type StateValidator struct {
	kurtosisClient kurtosis.Client
	log            logrus.FieldLogger
}

// NewStateValidator creates a new state validator
func NewStateValidator(client kurtosis.Client, log logrus.FieldLogger) *StateValidator {
	return &StateValidator{
		kurtosisClient: client,
		log:            log.WithField("component", "state_validator"),
	}
}

// ValidateEnclave validates that an enclave is in a recoverable state
func (sv *StateValidator) ValidateEnclave(ctx context.Context, enclaveName string, cfg *Config) error {
	sv.log.WithField("enclave", enclaveName).Info("Validating enclave state for recovery")

	// First check if enclave exists
	exists, err := sv.kurtosisClient.DoesEnclaveExist(ctx, enclaveName)
	if err != nil {
		return fmt.Errorf("failed to check enclave existence: %w", err)
	}

	if !exists {
		return fmt.Errorf("enclave %s does not exist", enclaveName)
	}

	sv.log.WithField("enclave", enclaveName).Debug("Enclave exists, validating services")

	// Validate expected services are accessible
	expectedServices := sv.getExpectedServices(cfg)
	for _, serviceName := range expectedServices {
		if err := sv.CheckServiceHealth(ctx, enclaveName, serviceName); err != nil {
			return fmt.Errorf("service %s validation failed: %w", serviceName, err)
		}
	}

	sv.log.WithField("enclave", enclaveName).Info("Enclave validation successful")
	return nil
}

// CheckServiceHealth checks if a service is healthy and accessible
func (sv *StateValidator) CheckServiceHealth(ctx context.Context, enclaveName, serviceName string) error {
	sv.log.WithFields(logrus.Fields{
		"enclave": enclaveName,
		"service": serviceName,
	}).Debug("Checking service health")

	// Use existing InspectService method to validate service accessibility
	_, err := sv.kurtosisClient.InspectService(enclaveName, serviceName)
	if err != nil {
		sv.log.WithFields(logrus.Fields{
			"enclave": enclaveName,
			"service": serviceName,
			"error":   err.Error(),
		}).Error("Service inspection failed")
		return fmt.Errorf("service %s is not accessible: %w", serviceName, err)
	}

	sv.log.WithFields(logrus.Fields{
		"enclave": enclaveName,
		"service": serviceName,
	}).Debug("Service health check passed")

	return nil
}

// getExpectedServices returns the list of expected services based on configuration
func (sv *StateValidator) getExpectedServices(cfg *Config) []string {
	// Based on the existing sync service pattern, we expect:
	// - Execution client service (format: el-1-{elclient}-{clclient})
	// - Consensus client service (format: cl-1-{clclient}-{elclient})
	// - Metrics exporter service (format: ethereum-metrics-exporter-1-{clclient}-{elclient})

	services := []string{
		fmt.Sprintf("el-1-%s-%s", cfg.ELClient, cfg.CLClient),
		fmt.Sprintf("cl-1-%s-%s", cfg.CLClient, cfg.ELClient),
		fmt.Sprintf("ethereum-metrics-exporter-1-%s-%s", cfg.CLClient, cfg.ELClient),
	}

	sv.log.WithFields(logrus.Fields{
		"el_client":         cfg.ELClient,
		"cl_client":         cfg.CLClient,
		"expected_services": services,
	}).Debug("Generated expected services list")

	return services
}
