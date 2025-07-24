package reporting

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/sirupsen/logrus"
	"gopkg.in/cenkalti/backoff.v1"
)

type Client struct {
	serverURL  string
	authToken  string
	httpClient *http.Client
	log        logrus.FieldLogger

	// Buffering for resilience
	updateQueue chan ProgressUpdateRequest
	stopCh      chan struct{}
	runID       string

	// Keepalive tracking
	keepaliveReq    *TestKeepaliveRequest
	keepaliveTicker *time.Ticker
}

func NewClient(serverURL, authToken string, log logrus.FieldLogger) *Client {
	return &Client{
		serverURL:   serverURL,
		authToken:   authToken,
		httpClient:  &http.Client{Timeout: 10 * time.Second},
		log:         log,
		updateQueue: make(chan ProgressUpdateRequest, 100),
		stopCh:      make(chan struct{}),
	}
}

func (c *Client) Start(ctx context.Context) {
	go c.processUpdateQueue(ctx)

	// Start keepalive ticker if we have a keepalive request stored
	if c.keepaliveReq != nil {
		c.keepaliveTicker = time.NewTicker(3 * time.Minute)
		go c.processKeepalive(ctx)
	}
}

func (c *Client) Stop() {
	if c.keepaliveTicker != nil {
		c.keepaliveTicker.Stop()
	}
	close(c.stopCh)
}

// Main reporting methods
func (c *Client) ReportTestKeepAlive(ctx context.Context, req TestKeepaliveRequest) error {
	c.runID = req.RunID

	// Store keepalive request for periodic updates
	c.keepaliveReq = &req

	// Start keepalive ticker now that we have a request
	if c.keepaliveTicker == nil {
		c.keepaliveTicker = time.NewTicker(3 * time.Minute)
		go c.processKeepalive(ctx)
	}

	return c.sendRequest(ctx, "POST", "/api/v1/tests/keepalive", c.keepaliveReq)
}

func (c *Client) ReportProgress(metrics ProgressMetrics) {
	// Sanitize metrics to prevent NaN/Inf values
	sanitizedMetrics := c.sanitizeMetrics(metrics)

	update := ProgressUpdateRequest{
		Timestamp:  time.Now().Unix(),
		Metrics:    sanitizedMetrics,
		IsComplete: false,
	}

	select {
	case c.updateQueue <- update:
	default:
		c.log.Warn("Progress update queue full, dropping update")
	}
}

func (c *Client) ReportTestComplete(ctx context.Context, req TestCompleteRequest) error {
	return c.sendRequest(ctx, "POST", fmt.Sprintf("/api/v1/tests/%s/complete", c.runID), req)
}

// Internal methods
func (c *Client) sendRequest(ctx context.Context, method, path string, body interface{}) error {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.serverURL+path, bytes.NewBuffer(jsonBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}

	backoffCfg := backoff.NewExponentialBackOff()
	backoffCfg.MaxElapsedTime = 30 * time.Second

	var lastErr error
	operation := func() error {
		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			return err
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			lastErr = fmt.Errorf("server returned status %d", resp.StatusCode)
			if resp.StatusCode >= 500 {
				return lastErr // Retry on server errors
			}
			return &backoff.PermanentError{Err: lastErr} // Don't retry on client errors
		}

		return nil
	}

	return backoff.Retry(operation, backoffCfg)
}

func (c *Client) processUpdateQueue(ctx context.Context) {
	for {
		select {
		case update := <-c.updateQueue:
			if err := c.sendProgressUpdate(ctx, c.runID, update); err != nil {
				c.log.WithError(err).Warn("Failed to send progress update")
			}
		case <-c.stopCh:
			return
		case <-ctx.Done():
			return
		}
	}
}

func (c *Client) sendProgressUpdate(ctx context.Context, runID string, update ProgressUpdateRequest) error {
	return c.sendRequest(ctx, "POST", fmt.Sprintf("/api/v1/tests/%s/progress", runID), update)
}

func (c *Client) processKeepalive(ctx context.Context) {
	for {
		select {
		case <-c.keepaliveTicker.C:
			if c.keepaliveReq != nil {
				// Update timestamp for current keepalive
				c.keepaliveReq.Timestamp = time.Now().Unix()
				if err := c.sendRequest(ctx, "POST", "/api/v1/tests/keepalive", *c.keepaliveReq); err != nil {
					c.log.WithError(err).Warn("Failed to send keepalive")
				}
			}
		case <-c.stopCh:
			return
		case <-ctx.Done():
			return
		}
	}
}

// sanitizeMetrics ensures no NaN or Inf values are sent to the server
func (c *Client) sanitizeMetrics(metrics ProgressMetrics) ProgressMetrics {
	sanitized := metrics

	// Replace NaN or Inf values with 0
	if math.IsNaN(sanitized.ExecSyncPercent) || math.IsInf(sanitized.ExecSyncPercent, 0) {
		sanitized.ExecSyncPercent = 0.0
	}

	if math.IsNaN(sanitized.ConsSyncPercent) || math.IsInf(sanitized.ConsSyncPercent, 0) {
		sanitized.ConsSyncPercent = 0.0
	}

	return sanitized
}
