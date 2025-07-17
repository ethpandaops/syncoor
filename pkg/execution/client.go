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
	sp, err := c.SyncProgress(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to get sync progress: %w", err)
	}

	// If sync progress is nil, not syncing
	if sp == nil {
		return false, nil
	}

	// Otherwise we need to check if the current block is less than the highest block
	return sp.CurrentBlock < sp.HighestBlock, nil
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

// SyncProgress gets the sync progress object if syncing, returns nil if not syncing
func (c *client) SyncProgress(ctx context.Context) (*SyncProgress, error) {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "eth_syncing",
		"params":  []interface{}{},
		"id":      1,
	}

	resp, err := c.makeRPCRequest(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to get sync progress: %w", err)
	}

	// eth_syncing returns false when not syncing, or a sync object when syncing
	var result interface{}
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return nil, fmt.Errorf("failed to parse sync progress: %w", err)
	}

	// If result is false, not syncing
	if syncing, ok := result.(bool); ok && !syncing {
		return nil, nil
	}

	// If result is an object, parse it as sync progress with hex values
	var rawProgress struct {
		CurrentBlock  string `json:"currentBlock"`
		HighestBlock  string `json:"highestBlock"`
		StartingBlock string `json:"startingBlock"`
	}
	if err := json.Unmarshal(resp.Result, &rawProgress); err != nil {
		return nil, fmt.Errorf("failed to parse sync progress object: %w", err)
	}

	// Parse hex strings to uint64
	progress := &SyncProgress{}
	if _, err := fmt.Sscanf(rawProgress.CurrentBlock, "0x%x", &progress.CurrentBlock); err != nil {
		return nil, fmt.Errorf("failed to parse currentBlock hex: %w", err)
	}
	if _, err := fmt.Sscanf(rawProgress.HighestBlock, "0x%x", &progress.HighestBlock); err != nil {
		return nil, fmt.Errorf("failed to parse highestBlock hex: %w", err)
	}
	if _, err := fmt.Sscanf(rawProgress.StartingBlock, "0x%x", &progress.StartingBlock); err != nil {
		return nil, fmt.Errorf("failed to parse startingBlock hex: %w", err)
	}

	return progress, nil
}

// GetSyncStatus gets the sync status from the execution client
func (c *client) GetSyncStatus(ctx context.Context) (*SyncStatus, error) {
	c.log.WithField("endpoint", c.rpcURL).Debug("Getting execution sync status")

	// Get block number
	blockNumber, err := c.GetBlockNumber(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get block number: %w", err)
	}

	// Check if syncing
	isSyncing, err := c.IsSyncing(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to check sync status: %w", err)
	}

	// Get peer count
	peerCount, err := c.GetPeerCount(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get peer count: %w", err)
	}

	status := &SyncStatus{
		BlockNumber: blockNumber,
		IsSyncing:   isSyncing,
		PeerCount:   peerCount,
	}

	// Check sync progress if	syncing
	if isSyncing {
		status.SyncProgress, err = c.SyncProgress(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to get sync progress: %w", err)
		}
	}

	return status, nil
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
