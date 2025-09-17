package synctest

import (
	"errors"
	"fmt"
	"time"
)

// Config validation errors
var (
	ErrInvalidELLogLevel              = errors.New("invalid execution client log level")
	ErrInvalidCLLogLevel              = errors.New("invalid consensus client log level")
	ErrInvalidMetricsExporterLogLevel = errors.New("invalid metrics exporter log level")
	ErrInvalidMetricsExporterPort     = errors.New("invalid metrics exporter port")
	ErrInvalidMetricsExporterInterval = errors.New("invalid metrics exporter disk usage interval")
)

// Config contains the configuration for the synctest service
type Config struct {
	CheckInterval         time.Duration
	RunTimeout            time.Duration
	ELClient              string
	CLClient              string
	ELImage               string
	CLImage               string
	ELExtraArgs           []string
	CLExtraArgs           []string
	ELEnvVars             map[string]string // Environment variables for execution layer client
	CLEnvVars             map[string]string // Environment variables for consensus layer client
	Network               string
	EnclaveName           string
	ReportDir             string
	Labels                map[string]string
	ServerURL             string // e.g., "https://api.syncoor.example"
	ServerAuth            string // Bearer token for authentication
	ClientLogs            bool   // Enable EL and CL client log output
	Supernode             bool   // Enable supernode (should only be used with peerdas)
	CheckpointSyncEnabled bool   // Enable checkpoint sync across the network
	CheckpointSyncURL     string // Checkpoint sync URL
	PublicPorts           bool   // Enable public port publishing
	PublicPortEL          uint32 // Public port for execution layer client (default: 8545)
	PublicPortCL          uint32 // Public port for consensus layer client (default: 4000)
	PublicIP              string // Public IP for port publishing (default: 'auto')
	ClientLogsLevelEL     string // Log level for execution layer client (default: 'info')
	ClientLogsLevelCL     string // Log level for consensus layer client (default: 'info')

	// Metrics Exporter Options
	MetricsExporterImage     string `json:"metrics_exporter_image"         yaml:"metrics_exporter_image"`
	MetricsExporterPort      int    `json:"metrics_exporter_port"          yaml:"metrics_exporter_port"`
	MetricsExporterLogLevel  string `json:"metrics_exporter_log_level"     yaml:"metrics_exporter_log_level"`
	MetricsExporterConfigDir string `json:"metrics_exporter_config_dir"    yaml:"metrics_exporter_config_dir"`
}

// SetDefaults sets default values for unspecified configuration fields
func (c *Config) SetDefaults() {
	// Set default checkpoint sync URL if not specified
	if c.CheckpointSyncURL == "" && c.Network != "" {
		c.CheckpointSyncURL = fmt.Sprintf("https://checkpoint-sync.%s.ethpandaops.io/", c.Network)
	}

	// Set default public ports if not specified
	if c.PublicPorts {
		if c.PublicPortEL == 0 {
			c.PublicPortEL = 40000
		}
		if c.PublicPortCL == 0 {
			c.PublicPortCL = 41000
		}
		if c.PublicIP == "" {
			c.PublicIP = "auto"
		}
	}

	// Set default client log levels if not specified
	if c.ClientLogsLevelEL == "" {
		c.ClientLogsLevelEL = "info"
	}
	if c.ClientLogsLevelCL == "" {
		c.ClientLogsLevelCL = "info"
	}

	// Set default metrics exporter options
	c.setMetricsExporterDefaults()
}

// Validate validates the configuration
func (c *Config) Validate() error {
	if c.CheckInterval <= 0 {
		return fmt.Errorf("check interval must be positive")
	}
	if c.ELClient == "" {
		return fmt.Errorf("execution client is required")
	}
	if c.CLClient == "" {
		return fmt.Errorf("consensus client is required")
	}
	if c.Network == "" {
		return fmt.Errorf("network is required")
	}
	if c.EnclaveName == "" {
		return fmt.Errorf("enclave name is required")
	}
	if c.ReportDir == "" {
		return fmt.Errorf("report directory is required")
	}

	// Validate client log levels
	validLogLevels := []string{"trace", "debug", "info", "warn", "error"}
	if !isValidLogLevel(c.ClientLogsLevelEL, validLogLevels) {
		return fmt.Errorf("%w: %s (valid values: trace, debug, info, warn, error)", ErrInvalidELLogLevel, c.ClientLogsLevelEL)
	}
	if !isValidLogLevel(c.ClientLogsLevelCL, validLogLevels) {
		return fmt.Errorf("%w: %s (valid values: trace, debug, info, warn, error)", ErrInvalidCLLogLevel, c.ClientLogsLevelCL)
	}

	// Validate metrics exporter configuration (always enabled)
	if err := c.validateMetricsExporterConfig(); err != nil {
		return err
	}

	return nil
}

// isValidLogLevel checks if the provided log level is valid
func isValidLogLevel(level string, validLevels []string) bool {
	for _, valid := range validLevels {
		if level == valid {
			return true
		}
	}
	return false
}

// GetMetricsExporterConfig returns the metrics exporter configuration
func (c *Config) GetMetricsExporterConfig() map[string]interface{} {
	return map[string]interface{}{
		"image":      c.MetricsExporterImage,
		"port":       c.MetricsExporterPort,
		"log_level":  c.MetricsExporterLogLevel,
		"config_dir": c.MetricsExporterConfigDir,
	}
}

// setMetricsExporterDefaults sets default values for metrics exporter configuration
func (c *Config) setMetricsExporterDefaults() {
	if c.MetricsExporterImage == "" {
		c.MetricsExporterImage = "ethpandaops/ethereum-metrics-exporter:debian-latest"
	}
	if c.MetricsExporterPort == 0 {
		c.MetricsExporterPort = 9090
	}
	if c.MetricsExporterLogLevel == "" {
		c.MetricsExporterLogLevel = "info"
	}
	// MetricsExporterConfigDir is left empty to be auto-generated
}

// validateMetricsExporterConfig validates the metrics exporter configuration
func (c *Config) validateMetricsExporterConfig() error {
	if c.MetricsExporterPort <= 0 || c.MetricsExporterPort > 65535 {
		return fmt.Errorf("%w: %d (must be between 1-65535)", ErrInvalidMetricsExporterPort, c.MetricsExporterPort)
	}

	// Validate metrics exporter log level
	validLogLevels := []string{"trace", "debug", "info", "warn", "error", "fatal", "panic"}
	if !isValidLogLevel(c.MetricsExporterLogLevel, validLogLevels) {
		return fmt.Errorf("%w: %s (valid values: trace, debug, info, warn, error, fatal, panic)",
			ErrInvalidMetricsExporterLogLevel, c.MetricsExporterLogLevel)
	}

	return nil
}
