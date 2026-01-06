package controlcenter

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ethpandaops/syncoor/pkg/api"
	"github.com/sirupsen/logrus"
)

const (
	defaultTimeout     = 10 * time.Second
	maxRetries         = 3
	initialBackoff     = 500 * time.Millisecond
	maxBackoff         = 5 * time.Second
	backoffMultiplier  = 2.0
)

// Client is an HTTP client for remote Syncoor APIs
type Client struct {
	log        logrus.FieldLogger
	httpClient *http.Client
}

// NewClient creates a new Syncoor API client
func NewClient(log logrus.FieldLogger) *Client {
	return &Client{
		log: log,
		httpClient: &http.Client{
			Timeout: defaultTimeout,
		},
	}
}

// FetchTests fetches the list of tests from a remote Syncoor API
func (c *Client) FetchTests(ctx context.Context, apiUrl string) (*api.TestListResponse, error) {
	url := strings.TrimSuffix(apiUrl, "/") + "/api/v1/tests"

	var result api.TestListResponse
	if err := c.fetchWithRetry(ctx, url, &result); err != nil {
		return nil, fmt.Errorf("failed to fetch tests from %s: %w", apiUrl, err)
	}

	return &result, nil
}

// FetchTestDetail fetches a specific test's details from a remote Syncoor API
func (c *Client) FetchTestDetail(ctx context.Context, apiUrl, runID string) (*api.TestDetail, error) {
	url := strings.TrimSuffix(apiUrl, "/") + "/api/v1/tests/" + runID

	var result api.TestDetail
	if err := c.fetchWithRetry(ctx, url, &result); err != nil {
		return nil, fmt.Errorf("failed to fetch test detail from %s: %w", apiUrl, err)
	}

	return &result, nil
}

// FetchHealth fetches the health status from a remote Syncoor API
func (c *Client) FetchHealth(ctx context.Context, apiUrl string) (*RemoteHealthResponse, error) {
	url := strings.TrimSuffix(apiUrl, "/") + "/health"

	var result RemoteHealthResponse
	if err := c.fetchWithRetry(ctx, url, &result); err != nil {
		return nil, fmt.Errorf("failed to fetch health from %s: %w", apiUrl, err)
	}

	return &result, nil
}

// RemoteHealthResponse represents the health response from a remote Syncoor API
type RemoteHealthResponse struct {
	Status      string `json:"status"`
	ActiveTests int    `json:"active_tests"`
	TotalTests  int    `json:"total_tests"`
}

// FetchUIConfig fetches the config.json from a Syncoor UI
func (c *Client) FetchUIConfig(ctx context.Context, uiUrl string) (*UIConfig, error) {
	url := strings.TrimSuffix(uiUrl, "/") + "/config.json"

	var result UIConfig
	if err := c.fetchWithRetry(ctx, url, &result); err != nil {
		return nil, fmt.Errorf("failed to fetch UI config from %s: %w", uiUrl, err)
	}

	return &result, nil
}

// UIConfig represents the config.json structure from a Syncoor UI
type UIConfig struct {
	Directories          []UIDirectory      `json:"directories,omitempty"`
	SyncoorApiEndpoints  []UIApiEndpoint    `json:"syncoorApiEndpoints,omitempty"`
	RefreshInterval      int                `json:"refreshInterval,omitempty"`
}

// UIDirectory represents a directory entry in the UI config
type UIDirectory struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName,omitempty"`
	URL         string `json:"url"`
	Enabled     *bool  `json:"enabled"` // Pointer to distinguish between false and not set
}

// IsEnabled returns true if the directory is enabled (defaults to true if not set)
func (d UIDirectory) IsEnabled() bool {
	if d.Enabled == nil {
		return true // Default to enabled if not specified
	}
	return *d.Enabled
}

// UIApiEndpoint represents a Syncoor API endpoint in the UI config
type UIApiEndpoint struct {
	Name    string `json:"name"`
	URL     string `json:"url"`
	Enabled *bool  `json:"enabled"` // Pointer to distinguish between false and not set
}

// IsEnabled returns true if the endpoint is enabled (defaults to true if not set)
func (e UIApiEndpoint) IsEnabled() bool {
	if e.Enabled == nil {
		return true // Default to enabled if not specified
	}
	return *e.Enabled
}

// FetchDirectoryIndex fetches the index.json from a directory URL
func (c *Client) FetchDirectoryIndex(ctx context.Context, directoryURL string) (*DirectoryIndex, error) {
	url := strings.TrimSuffix(directoryURL, "/") + "/index.json"

	var result DirectoryIndex
	if err := c.fetchWithRetry(ctx, url, &result); err != nil {
		return nil, fmt.Errorf("failed to fetch directory index from %s: %w", directoryURL, err)
	}

	return &result, nil
}

// fetchWithRetry performs an HTTP GET with retry logic
func (c *Client) fetchWithRetry(ctx context.Context, url string, result interface{}) error {
	var lastErr error
	backoff := initialBackoff

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			c.log.WithFields(logrus.Fields{
				"url":     url,
				"attempt": attempt + 1,
				"backoff": backoff,
			}).Debug("Retrying request")

			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}

			backoff = time.Duration(float64(backoff) * backoffMultiplier)
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		}

		err := c.doRequest(ctx, url, result)
		if err == nil {
			return nil
		}

		lastErr = err

		// Don't retry on 4xx errors (client errors)
		if httpErr, ok := err.(*HTTPError); ok && httpErr.StatusCode >= 400 && httpErr.StatusCode < 500 {
			return err
		}
	}

	return fmt.Errorf("after %d retries: %w", maxRetries, lastErr)
}

// doRequest performs a single HTTP GET request
func (c *Client) doRequest(ctx context.Context, url string, result interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "syncoor-control-center")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return &HTTPError{
			StatusCode: resp.StatusCode,
			Message:    string(body),
		}
	}

	// Read the response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	// Try to parse as a wrapped response first (data envelope)
	var wrapped struct {
		Data  json.RawMessage `json:"data"`
		Error *api.ErrorInfo  `json:"error"`
	}

	if err := json.Unmarshal(body, &wrapped); err == nil && wrapped.Data != nil {
		// Response was wrapped, unmarshal the data field
		if err := json.Unmarshal(wrapped.Data, result); err != nil {
			return fmt.Errorf("failed to decode response data: %w", err)
		}
		return nil
	}

	// Not wrapped, try to unmarshal directly
	if err := json.Unmarshal(body, result); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}

	return nil
}

// HTTPError represents an HTTP error response
type HTTPError struct {
	StatusCode int
	Message    string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("HTTP %d: %s", e.StatusCode, e.Message)
}
