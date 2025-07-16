package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/ethpandaops/ethereum-package-go/pkg/client"
)

// ConsensusSyncStatus holds beacon chain sync status information
type ConsensusSyncStatus struct {
	HeadSlot     string `json:"head_slot"`
	SyncDistance string `json:"sync_distance"`
	IsSyncing    bool   `json:"is_syncing"`
	IsOptimistic bool   `json:"is_optimistic"`
	ElOffline    bool   `json:"el_offline"`
}

// getConsensusSyncStatus returns sync status information from a consensus client
func getConsensusSyncStatus(ctx context.Context, client client.ConsensusClient) (*ConsensusSyncStatus, error) {
	beaconAPIURL := client.BeaconAPIURL()
	if beaconAPIURL == "" {
		return nil, fmt.Errorf("beacon API URL is empty")
	}

	// Create HTTP client with timeout
	httpClient := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Build the endpoint URL
	endpoint := fmt.Sprintf("%s/eth/v1/node/syncing", beaconAPIURL)

	// Create the request
	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	// Make the request
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request to %s: %w", endpoint, err)
	}
	defer resp.Body.Close()

	// Check status code
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("beacon API returned status %d for endpoint %s", resp.StatusCode, endpoint)
	}

	// Parse the response
	var syncResponse struct {
		Data ConsensusSyncStatus `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&syncResponse); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &syncResponse.Data, nil
}
