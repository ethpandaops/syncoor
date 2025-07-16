package consensus

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/sirupsen/logrus"
)

// Client defines the interface for consensus layer operations
type Client interface {
	GetSyncStatus(ctx context.Context) (*SyncStatus, error)
	Name() string
}

// SyncStatus represents the sync status of the consensus client
type SyncStatus struct {
	HeadSlot     string `json:"head_slot"`
	SyncDistance string `json:"sync_distance"`
	IsSyncing    bool   `json:"is_syncing"`
	IsOptimistic bool   `json:"is_optimistic"`
	ElOffline    bool   `json:"el_offline"`
}

// NodeHealth represents the health status of a consensus node
type NodeHealth struct {
	IsHealthy bool
	Status    string
}

// client implements the Client interface
type client struct {
	log        logrus.FieldLogger
	httpClient *http.Client
	endpoint   string
	name       string
}

// NewClient creates a new consensus client
func NewClient(log logrus.FieldLogger, name string, endpoint string) Client {
	return &client{
		log:      log.WithField("package", "consensus"),
		endpoint: endpoint,
		name:     name,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// GetSyncStatus gets the sync status from the consensus client
func (c *client) GetSyncStatus(ctx context.Context) (*SyncStatus, error) {
	c.log.WithField("endpoint", c.endpoint).Debug("Getting consensus sync status")

	// Create the request
	url := c.endpoint + "/eth/v1/node/syncing"
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	// Make the request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request to %s: %w", c.endpoint, err)
	}
	defer resp.Body.Close()

	// Check status code
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("beacon API returned status %d for endpoint %s", resp.StatusCode, url)
	}

	// Parse the response
	var syncResponse struct {
		Data SyncStatus `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&syncResponse); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &syncResponse.Data, nil
}

// Name returns the name of the consensus client
func (c *client) Name() string {
	return c.name
}

// Interface compliance check
var _ Client = (*client)(nil)
