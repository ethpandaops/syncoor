package synctest

import (
	"errors"
	"fmt"
	"time"
)

// Config validation errors
var (
	ErrInvalidELLogLevel = errors.New("invalid execution client log level")
	ErrInvalidCLLogLevel = errors.New("invalid consensus client log level")
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
