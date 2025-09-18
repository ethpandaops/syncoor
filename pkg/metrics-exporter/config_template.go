package metrics_exporter

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"text/template"

	"github.com/sirupsen/logrus"
)

// Static errors for better error handling
var (
	ErrInvalidMetricsPort = errors.New("invalid metrics port")
	ErrConsensusURLEmpty  = errors.New("consensus URL cannot be empty")
	ErrExecutionURLEmpty  = errors.New("execution URL cannot be empty")
	ErrLogLevelEmpty      = errors.New("log level cannot be empty")
	ErrInvalidLogLevel    = errors.New("invalid log level")
)

// ConfigTemplateData contains the data required for generating the metrics exporter configuration
type ConfigTemplateData struct {
	MetricsPort     int
	ConsensusURL    string
	ExecutionURL    string
	MonitoredDirs   []string
	LogLevel        string
	ELContainerName string // Execution layer container name
	CLContainerName string // Consensus layer container name
}

// ConfigGenerator handles generation of ethereum-metrics-exporter configuration files
type ConfigGenerator struct {
	logger logrus.FieldLogger
}

// NewConfigGenerator creates a new ConfigGenerator instance
func NewConfigGenerator(logger logrus.FieldLogger) *ConfigGenerator {
	return &ConfigGenerator{
		logger: logger.WithField("component", "config-generator"),
	}
}

// GenerateConfig generates the metrics exporter configuration as bytes
func (g *ConfigGenerator) GenerateConfig(data ConfigTemplateData) ([]byte, error) {
	g.logger.WithFields(logrus.Fields{
		"metrics_port":   data.MetricsPort,
		"consensus_url":  data.ConsensusURL,
		"execution_url":  data.ExecutionURL,
		"monitored_dirs": len(data.MonitoredDirs),
		"log_level":      data.LogLevel,
	}).Debug("Generating metrics exporter configuration")

	// Parse the template
	tmpl, err := template.New("metrics-exporter-config").Parse(g.GetDefaultTemplate())
	if err != nil {
		return nil, fmt.Errorf("failed to parse configuration template: %w", err)
	}

	// Execute the template
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, fmt.Errorf("failed to execute configuration template: %w", err)
	}

	g.logger.Debug("Successfully generated metrics exporter configuration")
	return buf.Bytes(), nil
}

// WriteConfigFile generates and writes the configuration file to the specified directory
func (g *ConfigGenerator) WriteConfigFile(configDir string, data ConfigTemplateData) (string, error) {
	g.logger.WithField("config_dir", configDir).Debug("Writing metrics exporter configuration file")

	// Create the configuration directory if it doesn't exist
	if err := os.MkdirAll(configDir, 0o750); err != nil {
		return "", fmt.Errorf("failed to create configuration directory: %w", err)
	}

	// Generate the configuration content
	configContent, err := g.GenerateConfig(data)
	if err != nil {
		return "", fmt.Errorf("failed to generate configuration: %w", err)
	}

	// Write the configuration file
	configPath := filepath.Join(configDir, "config.yaml")
	if err := os.WriteFile(configPath, configContent, 0o600); err != nil {
		return "", fmt.Errorf("failed to write configuration file: %w", err)
	}

	g.logger.WithField("config_path", configPath).Info("Successfully wrote metrics exporter configuration file")
	return configPath, nil
}

// GetDefaultTemplate returns the default configuration template for ethereum-metrics-exporter
func (g *ConfigGenerator) GetDefaultTemplate() string {
	return `consensus:
  enabled: true
  url: "{{ .ConsensusURL }}"
  name: "consensus-client"
execution:
  enabled: true
  url: "{{ .ExecutionURL }}"
  name: "execution-client"
  modules:
    - "eth"
    - "net"
    - "web3"
    - "txpool"
docker:
  enabled: true
  endpoint: "unix:///var/run/docker.sock"
  interval: "10s"
  containers:
{{- if .ELContainerName }}
    - name: "{{ .ELContainerName }}"
      type: "execution"
      port_bandwidth:
        enabled: true
        interval: "30s"
        monitor_all_ports: true
        protocols: ["tcp", "udp"]
      filesystem:
        enabled: true
      volumes:
        - name: "*"
          monitor: true
        - path: "/jwt"
          monitor: false
        - path: "/network-configs"
          monitor: false
{{- end }}
{{- if .CLContainerName }}
    - name: "{{ .CLContainerName }}"
      type: "consensus"
      port_bandwidth:
        enabled: true
        interval: "30s"
        monitor_all_ports: true
        protocols: ["tcp", "udp"]
      filesystem:
        enabled: true
      volumes:
        - name: "*"
          monitor: true
        - path: "/jwt"
          monitor: false
        - path: "/network-configs"
          monitor: false
{{- end }}
  labels:
    containerName: true
    containerID: true
    imageName: true
    imageTag: true
`
}

// ValidateConfigData validates the configuration data before template generation
func (g *ConfigGenerator) ValidateConfigData(data ConfigTemplateData) error {
	if data.MetricsPort <= 0 || data.MetricsPort > 65535 {
		return fmt.Errorf("%w: %d (must be between 1-65535)", ErrInvalidMetricsPort, data.MetricsPort)
	}

	if data.ConsensusURL == "" {
		return fmt.Errorf("%w", ErrConsensusURLEmpty)
	}

	if data.ExecutionURL == "" {
		return fmt.Errorf("%w", ErrExecutionURLEmpty)
	}

	if data.LogLevel == "" {
		return fmt.Errorf("%w", ErrLogLevelEmpty)
	}

	// Validate log level values
	validLogLevels := map[string]bool{
		"trace": true,
		"debug": true,
		"info":  true,
		"warn":  true,
		"error": true,
		"fatal": true,
		"panic": true,
	}

	if !validLogLevels[data.LogLevel] {
		return fmt.Errorf("%w: %s (must be one of: trace, debug, info, warn, error, fatal, panic)", ErrInvalidLogLevel, data.LogLevel)
	}

	g.logger.WithFields(logrus.Fields{
		"metrics_port":   data.MetricsPort,
		"consensus_url":  data.ConsensusURL,
		"execution_url":  data.ExecutionURL,
		"monitored_dirs": len(data.MonitoredDirs),
		"log_level":      data.LogLevel,
	}).Debug("Configuration data validation passed")

	return nil
}

// GetDefaultConfigData returns default configuration data for the metrics exporter
func (g *ConfigGenerator) GetDefaultConfigData() ConfigTemplateData {
	return ConfigTemplateData{
		MetricsPort:   9090,
		ConsensusURL:  "",
		ExecutionURL:  "",
		MonitoredDirs: []string{},
		LogLevel:      "info",
	}
}
