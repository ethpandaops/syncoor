package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
)

// TransportProtocol represents the transport protocol type
type TransportProtocol int

const (
	TCP TransportProtocol = 0
	UDP TransportProtocol = 2
)

// KurtosisPortInfo represents port information from Kurtosis service inspect
type KurtosisPortInfo struct {
	Number                   int               `json:"number"`
	Transport                TransportProtocol `json:"transport"`
	MaybeApplicationProtocol *string           `json:"maybe_application_protocol,omitempty"`
}

// KurtosisServiceInspectResult represents the result of kurtosis service inspect command
type KurtosisServiceInspectResult struct {
	Image       string                      `json:"image"`
	Ports       map[string]KurtosisPortInfo `json:"ports"`
	PublicPorts map[string]KurtosisPortInfo `json:"public_ports"`
	Files       map[string][]string         `json:"files"`
	Entrypoint  []string                    `json:"entrypoint"`
	Cmd         []string                    `json:"cmd"`
	EnvVars     map[string]string           `json:"env_vars"`
	Labels      map[string]string           `json:"labels"`
	TiniEnabled bool                        `json:"tini_enabled"`
	TtyEnabled  bool                        `json:"tty_enabled"`
}

// InspectKurtosisService runs `kurtosis service inspect $enclaveName $service -o json` and returns the parsed result
func InspectKurtosisService(enclaveName, service string) (*KurtosisServiceInspectResult, error) {
	// Run the kurtosis service inspect command
	cmd := exec.Command("kurtosis", "service", "inspect", enclaveName, service, "-o", "json")

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to run kurtosis service inspect command: %w", err)
	}

	// Parse the JSON output
	var result KurtosisServiceInspectResult
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON output: %w", err)
	}

	return &result, nil
}
