package controlcenter

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Config holds the Control Center configuration
type Config struct {
	Listen      string           `yaml:"listen"`
	CORSOrigins string           `yaml:"cors_origins"`
	AuthToken   string           `yaml:"auth_token"`
	Instances   []InstanceConfig `yaml:"instances"`
	Cache       CacheConfig      `yaml:"cache"`
	Pagination  PaginationConfig `yaml:"pagination"`
}

// InstanceConfig represents a single Syncoor instance
type InstanceConfig struct {
	Name    string `yaml:"name"`
	APIUrl  string `yaml:"api_url"`
	UIUrl   string `yaml:"ui_url"`
	Enabled bool   `yaml:"enabled"`
}

// CacheConfig holds caching configuration
type CacheConfig struct {
	RefreshInterval     time.Duration `yaml:"refresh_interval"`
	StaleTimeout        time.Duration `yaml:"stale_timeout"`
	MaxTestsPerInstance int           `yaml:"max_tests_per_instance"`
}

// PaginationConfig holds pagination defaults
type PaginationConfig struct {
	DefaultPageSize int `yaml:"default_page_size"`
	MaxPageSize     int `yaml:"max_page_size"`
}

// DefaultConfig returns a Config with sensible defaults
func DefaultConfig() *Config {
	return &Config{
		Listen:      ":8080",
		CORSOrigins: "*",
		Instances:   []InstanceConfig{},
		Cache: CacheConfig{
			RefreshInterval:     30 * time.Second,
			StaleTimeout:        5 * time.Minute,
			MaxTestsPerInstance: 1000,
		},
		Pagination: PaginationConfig{
			DefaultPageSize: 50,
			MaxPageSize:     200,
		},
	}
}

// LoadConfig loads configuration from a YAML file
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	cfg := DefaultConfig()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return cfg, nil
}

// Validate checks if the configuration is valid
func (c *Config) Validate() error {
	if c.Listen == "" {
		return fmt.Errorf("listen address is required")
	}

	// Must have at least one instance
	if len(c.Instances) == 0 {
		return fmt.Errorf("at least one instance must be configured")
	}

	// Validate instances
	for i, inst := range c.Instances {
		if inst.Name == "" {
			return fmt.Errorf("instance %d: name is required", i)
		}
		if inst.APIUrl == "" {
			return fmt.Errorf("instance %d (%s): api_url is required", i, inst.Name)
		}
	}

	// Validate cache settings
	if c.Cache.RefreshInterval <= 0 {
		c.Cache.RefreshInterval = 30 * time.Second
	}
	if c.Cache.StaleTimeout <= 0 {
		c.Cache.StaleTimeout = 5 * time.Minute
	}
	if c.Cache.MaxTestsPerInstance <= 0 {
		c.Cache.MaxTestsPerInstance = 1000
	}

	// Validate pagination
	if c.Pagination.DefaultPageSize <= 0 {
		c.Pagination.DefaultPageSize = 50
	}
	if c.Pagination.MaxPageSize <= 0 {
		c.Pagination.MaxPageSize = 200
	}
	if c.Pagination.DefaultPageSize > c.Pagination.MaxPageSize {
		c.Pagination.DefaultPageSize = c.Pagination.MaxPageSize
	}

	return nil
}

// GetEnabledInstances returns all enabled instances
func (c *Config) GetEnabledInstances() []InstanceConfig {
	var enabled []InstanceConfig
	for _, inst := range c.Instances {
		if inst.Enabled {
			enabled = append(enabled, inst)
		}
	}
	return enabled
}
