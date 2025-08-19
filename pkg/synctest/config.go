package synctest

import (
	"fmt"
	"time"
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
	return nil
}
