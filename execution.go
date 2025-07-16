package main

import (
	"context"
	"fmt"

	"github.com/ethpandaops/ethereum-package-go/pkg/client"
)

// ExecutionSyncStatus holds sync status information
type ExecutionSyncStatus struct {
	BlockNumber  uint64
	IsSyncing    bool
	PeerCount    int
	SyncProgress *client.SyncProgress
}

// getExecutionSyncStatus returns all sync-related information from an execution client
func getExecutionSyncStatus(ctx context.Context, client *client.BaseExecutionClient) (*ExecutionSyncStatus, error) {
	// Get block number
	blockNumber, err := client.GetBlockNumber(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get block number: %w", err)
	}

	// Check if syncing
	isSyncing, err := client.IsSyncing(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to check sync status: %w", err)
	}

	// Get peer count
	peerCount, err := client.GetPeerCount(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get peer count: %w", err)
	}

	status := &ExecutionSyncStatus{
		BlockNumber: blockNumber,
		IsSyncing:   isSyncing,
		PeerCount:   peerCount,
	}

	// Check sync progress if	syncing
	if isSyncing {
		status.SyncProgress, err = client.SyncProgress(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to get sync progress: %w", err)
		}
	}

	return status, nil
}
