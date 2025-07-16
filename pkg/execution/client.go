package execution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/sirupsen/logrus"
)

// Client defines the interface for execution layer operations
type Client interface {
	GetSyncStatus(ctx context.Context) (*SyncStatus, error)
	IsSyncing(ctx context.Context) (bool, error)
	GetBlockNumber(ctx context.Context) (uint64, error)
	GetPeerCount(ctx context.Context) (int, error)
	Name() string
}

// RPCResponse represents a JSON-RPC response
type RPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

// RPCError represents a JSON-RPC error
type RPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func (e *RPCError) Error() string {
	return fmt.Sprintf("RPC error %d: %s", e.Code, e.Message)
}

// SyncStatus represents the sync status of the execution client
type SyncStatus struct {
	BlockNumber  uint64
	IsSyncing    bool
	PeerCount    int
	SyncProgress *SyncProgress
}

// SyncProgress represents the sync progress when syncing
type SyncProgress struct {
	CurrentBlock  uint64 `json:"currentBlock"`
	HighestBlock  uint64 `json:"highestBlock"`
	StartingBlock uint64 `json:"startingBlock"`
}

// client implements the Client interface
type client struct {
	log        logrus.FieldLogger
	httpClient *http.Client
	rpcURL     string
	name       string
}

// NewClient creates a new execution client
func NewClient(log logrus.FieldLogger, name string, rpcURL string) Client {
	return &client{
		log:    log.WithField("package", "execution"),
		name:   name,
		rpcURL: rpcURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// GetPeerCount gets the number of connected peers
func (c *client) GetPeerCount(ctx context.Context) (int, error) {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "net_peerCount",
		"params":  []interface{}{},
		"id":      1,
	}

	resp, err := c.makeRPCRequest(ctx, req)
	if err != nil {
		return 0, fmt.Errorf("failed to get peer count: %w", err)
	}

	var peerCountHex string
	if err := json.Unmarshal(resp.Result, &peerCountHex); err != nil {
		return 0, fmt.Errorf("failed to parse peer count: %w", err)
	}

	var peerCount int
	if _, err := fmt.Sscanf(peerCountHex, "0x%x", &peerCount); err != nil {
		return 0, fmt.Errorf("failed to parse hex peer count: %w", err)
	}

	return peerCount, nil
}

// IsSyncing checks if the client is syncing
func (c *client) IsSyncing(ctx context.Context) (bool, error) {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "eth_syncing",
		"params":  []interface{}{},
		"id":      1,
	}

	resp, err := c.makeRPCRequest(ctx, req)
	if err != nil {
		return false, fmt.Errorf("failed to check sync status: %w", err)
	}

	// eth_syncing returns false when not syncing, or a sync object when syncing
	var result interface{}
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return false, fmt.Errorf("failed to parse sync status: %w", err)
	}

	// If result is false, not syncing
	if syncing, ok := result.(bool); ok {
		return syncing, nil
	}

	// If result is an object, syncing
	return true, nil
}

// GetBlockNumber gets the current block number
func (c *client) GetBlockNumber(ctx context.Context) (uint64, error) {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "eth_blockNumber",
		"params":  []interface{}{},
		"id":      1,
	}

	resp, err := c.makeRPCRequest(ctx, req)
	if err != nil {
		return 0, fmt.Errorf("failed to get block number: %w", err)
	}

	var blockNumberHex string
	if err := json.Unmarshal(resp.Result, &blockNumberHex); err != nil {
		return 0, fmt.Errorf("failed to parse block number: %w", err)
	}

	var blockNumber uint64
	if _, err := fmt.Sscanf(blockNumberHex, "0x%x", &blockNumber); err != nil {
		return 0, fmt.Errorf("failed to parse hex block number: %w", err)
	}

	return blockNumber, nil
}

// GetSyncStatus gets the sync status from the execution client
func (c *client) GetSyncStatus(ctx context.Context) (*SyncStatus, error) {
	c.log.WithField("endpoint", c.rpcURL).Debug("Getting execution sync status")

	payload := map[string]any{
		"jsonrpc": "2.0",
		"method":  "eth_syncing",
		"params":  []any{},
		"id":      1,
	}

	_, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal JSON-RPC payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.rpcURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var rpcResponse struct {
		Result interface{} `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&rpcResponse); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if rpcResponse.Error != nil {
		return nil, fmt.Errorf("JSON-RPC error: %s", rpcResponse.Error.Message)
	}

	// If result is false, the node is not syncing
	if result, ok := rpcResponse.Result.(bool); ok && !result {
		return &SyncStatus{
			IsSyncing: false,
		}, nil
	}

	// If result is an object, parse sync details
	if _, ok := rpcResponse.Result.(map[string]interface{}); ok {
		return &SyncStatus{
			IsSyncing: true,
			// Note: Full implementation would parse currentBlock, highestBlock, etc.
		}, nil
	}

	return &SyncStatus{
		IsSyncing: false,
	}, nil
}

// makeRPCRequest makes a JSON-RPC request
func (c *client) makeRPCRequest(ctx context.Context, req interface{}) (*RPCResponse, error) {
	if c.rpcURL == "" {
		return nil, fmt.Errorf("RPC URL not configured")
	}

	reqBytes, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.rpcURL, bytes.NewReader(reqBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	var rpcResp RPCResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if rpcResp.Error != nil {
		return nil, rpcResp.Error
	}

	return &rpcResp, nil
}

// Name returns the name of the execution client
func (c *client) Name() string {
	return c.name
}

// Interface compliance check
var _ Client = (*client)(nil)
