package synctest

import (
	"fmt"
	"time"
)

// Config contains the configuration for the synctest service
type Config struct {
	CheckInterval time.Duration
	RunTimeout    time.Duration
	ELClient      string
	CLClient      string
	ELImage       string
	CLImage       string
	ELExtraArgs   []string
	CLExtraArgs   []string
	Network       string
	EnclaveName   string
	ReportDir     string
	Labels        map[string]string
	ServerURL     string // e.g., "https://api.syncoor.example"
	ServerAuth    string // Bearer token for authentication
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
