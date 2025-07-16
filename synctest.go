package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/ethpandaops/ethereum-package-go"
	"github.com/ethpandaops/ethereum-package-go/pkg/client"
	"github.com/ethpandaops/ethereum-package-go/pkg/config"
	"github.com/ethpandaops/ethereum-package-go/pkg/network"
	"github.com/sirupsen/logrus"
)

// SyncTestConfig holds the configuration for the sync test
type SyncTestConfig struct {
	CheckInterval time.Duration
	ELClient      string
	CLClient      string
	ELImage       string
	CLImage       string
	Network       string
	EnclaveName   string
	ReportDir     string
	Labels        map[string]string
}

// SyncProgressEntry represents the progress data at a specific timestamp
type SyncProgressEntry struct {
	T                        int64  `json:"t"`  // Timestamp
	Block                    uint64 `json:"b"`  // Execution client block number
	Slot                     uint64 `json:"s"`  // Consensus client slot number
	DiskUsageExecutionClient uint64 `json:"de"` // Execution client disk usage (bytes)
	DiskUsageConsensusClient uint64 `json:"dc"` // Consensus client disk usage (bytes)
	PeersExecutionClient     uint64 `json:"pe"` // Execution client peers
	PeersConsensusClient     uint64 `json:"pc"` // Consensus client peers
}

// SyncStatus contains sync-related information
type SyncStatus struct {
	Start            int64               `json:"start"`
	End              int64               `json:"end"`
	Block            uint64              `json:"block"`
	SyncProgress     []SyncProgressEntry `json:"sync_progress,omitempty"`
	SyncProgressFile string              `json:"sync_progress_file,omitempty"`
}

// ClientInfo contains information about the client
type ClientInfo struct {
	Name       string   `json:"name"`
	Type       string   `json:"type"`
	Image      string   `json:"image"`
	Entrypoint []string `json:"entrypoint"`
	Cmd        []string `json:"cmd"`
	Version    string   `json:"version"`
}

// Report represents the complete sync test report
type Report struct {
	RunID               string            `json:"run_id"`
	Timestamp           int64             `json:"timestamp"`
	Labels              map[string]string `json:"labels,omitempty"`
	SyncStatus          SyncStatus        `json:"sync_status"`
	ExecutionClientInfo ClientInfo        `json:"execution_client_info"`
	ConsensusClientInfo ClientInfo        `json:"consensus_client_info"`
}

// SyncTest represents a sync test instance
type SyncTest struct {
	config          SyncTestConfig
	network         network.Network
	executionClient *client.BaseExecutionClient
	consensusClient client.ConsensusClient
	report          *Report
	startTime       time.Time
	metricsClient   *MetricsClient
}

// NewSyncTest creates a new SyncTest instance with the given config
func NewSyncTest(config SyncTestConfig) *SyncTest {
	runID := fmt.Sprintf("sync-test-%d", time.Now().UnixNano())
	report := &Report{
		RunID:     runID,
		Timestamp: time.Now().Unix(),
		Labels:    config.Labels,
		SyncStatus: SyncStatus{
			SyncProgress: []SyncProgressEntry{},
		},
	}

	return &SyncTest{
		config:        config,
		report:        report,
		metricsClient: NewMetricsClient(),
	}
}

// Start initializes and starts the Ethereum network
func (st *SyncTest) Start(ctx context.Context) error {

	// Prepare participant config
	participantConfig := config.ParticipantConfig{
		ELType:         client.Type(st.config.ELClient),
		CLType:         client.Type(st.config.CLClient),
		ValidatorCount: 0,
	}

	// Set images if provided
	if st.config.ELImage != "" {
		participantConfig.ELImage = &st.config.ELImage
	}
	if st.config.CLImage != "" {
		participantConfig.CLImage = &st.config.CLImage
	}

	network, err := ethereum.Run(ctx,
		ethereum.WithTimeout(5*time.Minute),
		ethereum.WithOrphanOnExit(),
		ethereum.WithReuse(st.config.EnclaveName),
		ethereum.WithEnclaveName(st.config.EnclaveName),
		ethereum.WithConfig(&config.EthereumPackageConfig{
			EthereumMetricsExporterEnabled: boolPtr(true),
			Participants:                   []config.ParticipantConfig{participantConfig},
			NetworkParams: &config.NetworkParams{
				Network: st.config.Network,
			},
			Persistent: true,
		}),
	)
	if err != nil {
		return fmt.Errorf("failed to start network: %w", err)
	}

	st.startTime = time.Now()
	st.report.SyncStatus.Start = st.startTime.Unix()

	st.network = network

	// Get the first execution client
	executionClients := st.network.ExecutionClients().All()
	if len(executionClients) == 0 {
		return fmt.Errorf("no execution clients available")
	}
	st.executionClient = client.NewBaseExecutionClient(client.ClientConfig{
		Name:       executionClients[0].Name(),
		RPCURL:     executionClients[0].RPCURL(),
		WSURL:      executionClients[0].WSURL(),
		EngineURL:  executionClients[0].EngineURL(),
		MetricsURL: executionClients[0].MetricsURL(),
		Enode:      executionClients[0].Enode(),
	})

	// Get the first consensus client
	consensusClients := st.network.ConsensusClients().All()
	if len(consensusClients) == 0 {
		return fmt.Errorf("no consensus clients available")
	}
	st.consensusClient = consensusClients[0]

	elInspect, err := InspectKurtosisService(st.network.EnclaveName(), st.executionClient.Name())
	if err != nil {
		return fmt.Errorf("failed to inspect execution client: %w", err)
	}
	st.report.ExecutionClientInfo = ClientInfo{
		Name:       st.executionClient.Name(),
		Image:      elInspect.Image,
		Cmd:        elInspect.Cmd,
		Entrypoint: elInspect.Entrypoint,
		Type:       st.config.ELClient,
	}

	clInspect, err := InspectKurtosisService(st.network.EnclaveName(), st.consensusClient.Name())
	if err != nil {
		return fmt.Errorf("failed to inspect consensus client: %w", err)
	}
	st.report.ConsensusClientInfo = ClientInfo{
		Name:       st.consensusClient.Name(),
		Image:      clInspect.Image,
		Cmd:        clInspect.Cmd,
		Entrypoint: clInspect.Entrypoint,
		Type:       st.config.CLClient,
	}

	logrus.WithFields(logrus.Fields{
		"client":     st.executionClient.Name(),
		"rpc_url":    st.executionClient.RPCURL(),
		"ws_url":     st.executionClient.WSURL(),
		"engine_url": st.executionClient.EngineURL(),
		"type":       st.executionClient.Type(),
		"image":      elInspect.Image,
	}).Info("Execution client info")

	logrus.WithFields(logrus.Fields{
		"client":         st.consensusClient.Name(),
		"type":           st.consensusClient.Type(),
		"version":        st.consensusClient.Version(),
		"beacon_api_url": st.consensusClient.BeaconAPIURL(),
		"metrics_url":    st.consensusClient.MetricsURL(),
		"image":          clInspect.Image,
	}).Info("Consensus client info")

	metricsExporterEndpoint, err := st.metricsExporterServiceEndpoint()
	if err != nil {
		return fmt.Errorf("failed to get metrics exporter endpoint: %w", err)
	}
	logrus.WithFields(logrus.Fields{
		"metrics_url": metricsExporterEndpoint,
	}).Info("Metrics exporter info")

	return nil
}

// WaitForSync performs the sync status checking for both execution and consensus clients and returns when both are synced
func (st *SyncTest) WaitForSync(ctx context.Context) error {
	if st.network == nil {
		return fmt.Errorf("network not started, call Start() first")
	}

	// Start sync checking loop
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		gotExecutionSync := false
		gotConsensusSync := false

		// Check execution client sync status
		execSyncStatus, err := getExecutionSyncStatus(ctx, st.executionClient)
		if err != nil {
			log.Printf("Failed to get execution sync status for %s: %v", st.executionClient.Name(), err)
		} else {
			gotExecutionSync = true
			logrus.WithFields(logrus.Fields{
				"client":        st.executionClient.Name(),
				"current_block": execSyncStatus.BlockNumber,
				"is_syncing":    execSyncStatus.IsSyncing,
				"peer_count":    execSyncStatus.PeerCount,
			}).Debug("Execution client sync status")

			if execSyncStatus.SyncProgress != nil && execSyncStatus.SyncProgress.CurrentBlock > 0 {
				percent := float64(execSyncStatus.SyncProgress.CurrentBlock) / float64(execSyncStatus.SyncProgress.HighestBlock) * 100
				logrus.WithFields(logrus.Fields{
					"client":         st.executionClient.Name(),
					"current_block":  execSyncStatus.SyncProgress.CurrentBlock,
					"highest_block":  execSyncStatus.SyncProgress.HighestBlock,
					"starting_block": execSyncStatus.SyncProgress.StartingBlock,
					"progress":       fmt.Sprintf("%.2f%%", percent),
				}).Debug("Execution client sync progress")
			}
		}

		// Check consensus client sync status
		consensusSyncStatus, err := getConsensusSyncStatus(ctx, st.consensusClient)
		if err != nil {
			log.Printf("Failed to get consensus sync status for %s: %v", st.consensusClient.Name(), err)
		} else {
			gotConsensusSync = true
			logrus.WithFields(logrus.Fields{
				"client":        st.consensusClient.Name(),
				"head_slot":     consensusSyncStatus.HeadSlot,
				"sync_distance": consensusSyncStatus.SyncDistance,
				"is_syncing":    consensusSyncStatus.IsSyncing,
				"is_optimistic": consensusSyncStatus.IsOptimistic,
				"el_offline":    consensusSyncStatus.ElOffline,
			}).Debug("Consensus client sync status")

		}

		// Check ethereum metrics exporter metrics
		metrics, err := st.getMetrics()
		if err != nil {
			log.Printf("Failed to get metrics: %v", err)
		} else {
			logrus.WithFields(logrus.Fields{
				"data": metrics,
			}).Debug("Metrics exporter status")
			logrus.WithFields(logrus.Fields{
				"cl_disk":          metrics.ConDiskUsage,
				"cl_is_syncing":    metrics.ConIsSyncing,
				"cl_peers":         metrics.ConPeers,
				"cl_slot":          metrics.ConSyncHeadSlot,
				"cl_sync_distance": metrics.ConSyncEstimatedHighestSlot,
				"cl_sync_perc":     metrics.ConSyncPercentage,
				"cl_syncing":       metrics.ConIsSyncing,
				"cl_version":       metrics.ConVersion,
				"el_block":         metrics.ExeSyncCurrentBlock,
				"el_chain_id":      metrics.ExeChainID,
				"el_disk":          metrics.ExeDiskUsage,
				"el_highest_block": metrics.ExeSyncHighestBlock,
				"el_peers":         metrics.ExePeers,
				"el_sync_perc":     metrics.ExeSyncPercentage,
				"el_syncing":       metrics.ExeIsSyncing,
				"el_version":       metrics.ExeVersion,
			}).Debug("Metrics exporter status")
		}

		if gotExecutionSync && gotConsensusSync && metrics != nil {
			logrus.WithFields(logrus.Fields{

				"cl_optimistic":    consensusSyncStatus.IsOptimistic,
				"cl_progress":      metrics.ConSyncPercentage,
				"cl_slot":          metrics.ConSyncHeadSlot,
				"cl_sync_distance": metrics.ConSyncEstimatedHighestSlot,
				"cl_syncing":       metrics.ConIsSyncing,
				"cl_type":          st.config.CLClient,

				"el_block":         metrics.ExeSyncCurrentBlock,
				"el_chain_id":      metrics.ExeChainID,
				"el_highest_block": metrics.ExeSyncHighestBlock,
				"el_is_syncing":    metrics.ExeIsSyncing,
				"el_progress":      metrics.ExeSyncPercentage,
				"el_type":          st.config.ELClient,
			}).Info("Sync progress")

			// Track progress if we got all data
			timestamp := time.Now().Unix()
			var blockNumber uint64
			if execSyncStatus.SyncProgress != nil && execSyncStatus.SyncProgress.CurrentBlock > 0 {
				blockNumber = execSyncStatus.SyncProgress.CurrentBlock
			}
			if execSyncStatus.BlockNumber > blockNumber {
				blockNumber = execSyncStatus.BlockNumber
			}
			st.report.SyncStatus.Block = blockNumber

			// Convert slot string to uint64
			slotNumber, err := strconv.ParseUint(consensusSyncStatus.HeadSlot, 10, 64)
			if err != nil {
				slotNumber = 0 // Default to 0 if conversion fails
			}

			progressEntry := SyncProgressEntry{
				T:                        timestamp,
				Block:                    blockNumber,
				Slot:                     slotNumber,
				DiskUsageExecutionClient: metrics.ExeDiskUsage,
				DiskUsageConsensusClient: metrics.ConDiskUsage,
				PeersExecutionClient:     metrics.ExePeers,
				PeersConsensusClient:     metrics.ConPeers,
			}
			st.report.ExecutionClientInfo.Version = metrics.ExeVersion
			st.report.ConsensusClientInfo.Version = metrics.ConVersion
			st.report.SyncStatus.SyncProgress = append(st.report.SyncStatus.SyncProgress, progressEntry)
		}

		// Check if we are synced and exit the loop
		if gotExecutionSync && gotConsensusSync &&
			consensusSyncStatus.IsOptimistic == false &&
			consensusSyncStatus.IsSyncing == false &&
			execSyncStatus.IsSyncing == false &&
			execSyncStatus.BlockNumber > 0 {
			// Set end time in report
			st.report.SyncStatus.End = time.Now().Unix()

			logrus.WithFields(logrus.Fields{
				"enclave":          st.network.EnclaveName(),
				"execution_client": st.executionClient.Name(),
				"consensus_client": st.consensusClient.Name(),
				"current_block":    execSyncStatus.BlockNumber,
				"took":             time.Since(st.startTime),
			}).Info("Execution and consensus clients are synced")
			return nil
		}

		time.Sleep(st.config.CheckInterval)
	}
}

// GetReport returns the current sync test report
func (st *SyncTest) GetReport() *Report {
	return st.report
}

// ExportReportJSON exports the sync test report as JSON
func (st *SyncTest) ExportReportJSON() ([]byte, error) {
	return json.MarshalIndent(st.report, "", "  ")
}

// SaveReportToFile saves the sync test report to a file in the specified directory
func (st *SyncTest) SaveReportToFile() error {
	// Create filename: runID + network + execution-client + consensus-client
	baseFilename := fmt.Sprintf("%s_%s_%s_%s",
		st.report.RunID,
		st.config.Network,
		st.config.ELClient,
		st.config.CLClient)

	mainFilePath := filepath.Join(st.config.ReportDir, baseFilename+".main.json")
	progressFilePath := filepath.Join(st.config.ReportDir, baseFilename+".progress.json")

	if err := os.MkdirAll(st.config.ReportDir, 0755); err != nil {
		return fmt.Errorf("failed to create report directory: %w", err)
	}

	// Save sync progress to separate file
	progressData, err := json.MarshalIndent(st.report.SyncStatus.SyncProgress, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal sync progress: %w", err)
	}

	if err := os.WriteFile(progressFilePath, progressData, 0644); err != nil {
		return fmt.Errorf("failed to write progress file: %w", err)
	}

	// Create a copy of the report for the main file (without sync progress data)
	mainReport := *st.report
	mainReport.SyncStatus.SyncProgressFile = baseFilename + ".progress.json"
	mainReport.SyncStatus.SyncProgress = nil // Remove the sync progress data from main report

	jsonData, err := json.MarshalIndent(&mainReport, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to export report as JSON: %w", err)
	}

	if err := os.WriteFile(mainFilePath, jsonData, 0644); err != nil {
		return fmt.Errorf("failed to write report to file: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"report_file":   mainFilePath,
		"progress_file": progressFilePath,
		"run_id":        st.report.RunID,
	}).Info("Sync test report and progress saved to files")

	return nil
}

func boolPtr(b bool) *bool {
	return &b
}

func (st *SyncTest) metricsExporterServiceEndpoint() (string, error) {
	name := fmt.Sprintf("ethereum-metrics-exporter-1-%s-%s", st.config.CLClient, st.config.ELClient)
	service, err := InspectKurtosisService(st.network.EnclaveName(), name)
	if err != nil {
		return "", fmt.Errorf("failed to inspect metrics exporter service: %w", err)
	}
	return fmt.Sprintf("http://127.0.0.1:%d/metrics", service.PublicPorts["http"].Number), nil
}

func (st *SyncTest) getMetrics() (*ParsedMetrics, error) {
	metricsExporterEndpoint, err := st.metricsExporterServiceEndpoint()
	if err != nil {
		return nil, fmt.Errorf("failed to get metrics exporter endpoint: %w", err)
	}
	return st.metricsClient.FetchMetrics(metricsExporterEndpoint)
}
