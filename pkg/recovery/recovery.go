package recovery

import (
	"context"
	"time"

	"github.com/ethpandaops/syncoor/pkg/kurtosis"
	"github.com/ethpandaops/syncoor/pkg/report"
	"github.com/sirupsen/logrus"
)

// Config represents the configuration needed for recovery operations
type Config struct {
	Network     string
	ELClient    string
	CLClient    string
	ELImage     string
	CLImage     string
	ELExtraArgs []string
	CLExtraArgs []string
	ELEnvVars   map[string]string
	CLEnvVars   map[string]string
	EnclaveName string
}

// Service defines the interface for recovery operations
type Service interface {
	Start(ctx context.Context) error
	Stop() error
	CheckRecoverable(ctx context.Context, cfg *Config) (*RecoveryState, error)
	ValidateEnclave(ctx context.Context, enclaveName string, cfg *Config) error
}

// RecoveryState represents the state of a recoverable sync operation
type RecoveryState struct {
	EnclaveName    string                    `json:"enclave_name"`
	TempReportPath string                    `json:"temp_report_path"`
	Config         *Config                   `json:"config"`
	LastUpdate     time.Time                 `json:"last_update"`
	Progress       *report.SyncProgressEntry `json:"progress"`
}

// service implements the Service interface
type service struct {
	kurtosisClient kurtosis.Client
	configMatcher  *ConfigMatcher
	stateValidator *StateValidator
	log            logrus.FieldLogger
}

// NewService creates a new recovery service
func NewService(kurtosisClient kurtosis.Client, log logrus.FieldLogger) Service {
	serviceLog := log.WithField("package", "recovery")

	return &service{
		kurtosisClient: kurtosisClient,
		configMatcher:  NewConfigMatcher(serviceLog),
		stateValidator: NewStateValidator(kurtosisClient, serviceLog),
		log:            serviceLog,
	}
}

// Start initializes the recovery service
func (s *service) Start(ctx context.Context) error {
	s.log.Info("Starting recovery service")
	return nil
}

// Stop shuts down the recovery service
func (s *service) Stop() error {
	s.log.Info("Stopping recovery service")
	return nil
}

// CheckRecoverable checks if a sync operation can be recovered based on the configuration
func (s *service) CheckRecoverable(ctx context.Context, cfg *Config) (*RecoveryState, error) {
	s.log.WithFields(logrus.Fields{
		"network":   cfg.Network,
		"el_client": cfg.ELClient,
		"cl_client": cfg.CLClient,
	}).Info("Checking for recoverable sync state")

	// Generate expected enclave name from config
	enclaveName := s.configMatcher.GenerateEnclavePattern(cfg)

	// Check if enclave exists
	exists, err := s.kurtosisClient.DoesEnclaveExist(ctx, enclaveName)
	if err != nil {
		return nil, err
	}

	if !exists {
		s.log.WithField("enclave", enclaveName).Debug("No existing enclave found")
		return nil, nil
	}

	s.log.WithField("enclave", enclaveName).Info("Found existing enclave")

	// TODO: Load temp report if it exists
	// For now, return basic recovery state
	return &RecoveryState{
		EnclaveName:    enclaveName,
		TempReportPath: "", // Will be populated by report service
		Config:         cfg,
		LastUpdate:     time.Now(),
		Progress:       nil, // Will be populated by report service
	}, nil
}

// ValidateEnclave validates that an enclave is in a recoverable state
func (s *service) ValidateEnclave(ctx context.Context, enclaveName string, cfg *Config) error {
	s.log.WithField("enclave", enclaveName).Info("Validating enclave state")

	return s.stateValidator.ValidateEnclave(ctx, enclaveName, cfg)
}

// Interface compliance check
var _ Service = (*service)(nil)
