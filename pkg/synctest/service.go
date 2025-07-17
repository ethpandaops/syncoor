package synctest

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/ethpandaops/ethereum-package-go"
	"github.com/ethpandaops/ethereum-package-go/pkg/client"
	"github.com/ethpandaops/ethereum-package-go/pkg/config"
	"github.com/ethpandaops/ethereum-package-go/pkg/network"
	"github.com/ethpandaops/syncoor/pkg/consensus"
	"github.com/ethpandaops/syncoor/pkg/execution"
	"github.com/ethpandaops/syncoor/pkg/kurtosis"
	metrics_exporter "github.com/ethpandaops/syncoor/pkg/metrics-exporter"
	"github.com/ethpandaops/syncoor/pkg/report"
)

// Service defines the interface for the sync test service
type Service interface {
	Start(ctx context.Context) error
	Stop() error
	WaitForSync(ctx context.Context) error
}

// service implements the Service interface
type service struct {
	log     logrus.FieldLogger
	cfg     Config
	network network.Network

	executionClient client.ExecutionClient
	consensusClient client.ConsensusClient

	consensusClientFetcher       consensus.Client
	executionClientFetcher       execution.Client
	metricsExporterClientFetcher metrics_exporter.Client
	kurtosisClient               kurtosis.Client
	reportService                report.Service

	cancel context.CancelFunc
}

// Verify interface compliance at compile time
var _ Service = (*service)(nil)

// NewService creates a new sync test service
func NewService(
	log logrus.FieldLogger,
	cfg Config,
) Service {
	return &service{
		log:            log.WithField("package", "synctest"),
		cfg:            cfg,
		kurtosisClient: kurtosis.NewClient(log),
		reportService:  report.NewService(log),
	}
}

// Start initializes the synctest service
func (s *service) Start(ctx context.Context) error {
	s.log.Info("Starting synctest service")

	ctx, cancel := context.WithCancel(ctx)
	s.cancel = cancel

	// Prepare participant config
	participantConfig := config.ParticipantConfig{
		ELType:         client.Type(s.cfg.ELClient),
		CLType:         client.Type(s.cfg.CLClient),
		ValidatorCount: 0,
	}

	// Set images if provided
	if s.cfg.ELImage != "" {
		participantConfig.ELImage = &s.cfg.ELImage
	}
	if s.cfg.CLImage != "" {
		participantConfig.CLImage = &s.cfg.CLImage
	}

	// Set extra args if provided
	if len(s.cfg.ELExtraArgs) > 0 {
		participantConfig.ELExtraParams = s.cfg.ELExtraArgs
	}
	if len(s.cfg.CLExtraArgs) > 0 {
		participantConfig.CLExtraParams = s.cfg.CLExtraArgs
	}

	runOpts := []ethereum.RunOption{
		ethereum.WithOrphanOnExit(),
		ethereum.WithReuse(s.cfg.EnclaveName),
		ethereum.WithEnclaveName(s.cfg.EnclaveName),
		ethereum.WithConfig(&config.EthereumPackageConfig{
			EthereumMetricsExporterEnabled: boolPtr(true),
			Participants:                   []config.ParticipantConfig{participantConfig},
			NetworkParams: &config.NetworkParams{
				Network: s.cfg.Network,
			},
			Persistent: true,
		}),
	}

	if s.cfg.RunTimeout > 0 {
		runOpts = append(runOpts, ethereum.WithTimeout(s.cfg.RunTimeout))
	}

	network, err := ethereum.Run(ctx, runOpts...,
	)
	if err != nil {
		return fmt.Errorf("failed to start network: %w", err)
	}

	// Start report service
	if err := s.reportService.Start(ctx); err != nil {
		return fmt.Errorf("failed to start report service: %w", err)
	}

	s.network = network

	// Create execution client fetcher
	executionClients := s.network.ExecutionClients().All()
	if len(executionClients) == 0 {
		return fmt.Errorf("no execution clients available")
	}
	s.executionClient = executionClients[0]
	s.executionClientFetcher = execution.NewClient(s.log, s.executionClient.Name(), s.executionClient.RPCURL())

	elInspect, err := s.kurtosisClient.InspectService(s.network.EnclaveName(), s.executionClientFetcher.Name())
	if err != nil {
		return fmt.Errorf("failed to inspect execution client: %w", err)
	}

	s.reportService.SetExecutionClientInfo(ctx, &report.ClientInfo{
		Name:       s.executionClientFetcher.Name(),
		Image:      elInspect.Image,
		Cmd:        elInspect.Cmd,
		Entrypoint: elInspect.Entrypoint,
		Type:       s.cfg.ELClient,
	})

	// Create consensus client fetcher
	consensusClients := s.network.ConsensusClients().All()
	if len(consensusClients) == 0 {
		return fmt.Errorf("no consensus clients available")
	}
	s.consensusClient = consensusClients[0]
	s.consensusClientFetcher = consensus.NewClient(s.log, s.consensusClient.Name(), s.consensusClient.BeaconAPIURL())

	clInspect, err := s.kurtosisClient.InspectService(s.network.EnclaveName(), s.consensusClientFetcher.Name())
	if err != nil {
		return fmt.Errorf("failed to inspect consensus client: %w", err)
	}

	s.reportService.SetConsensusClientInfo(ctx, &report.ClientInfo{
		Name:       s.consensusClientFetcher.Name(),
		Image:      clInspect.Image,
		Cmd:        clInspect.Cmd,
		Entrypoint: clInspect.Entrypoint,
		Type:       s.cfg.CLClient,
	})

	logrus.WithFields(logrus.Fields{
		"client":     s.executionClient.Name(),
		"rpc_url":    s.executionClient.RPCURL(),
		"ws_url":     s.executionClient.WSURL(),
		"engine_url": s.executionClient.EngineURL(),
		"type":       s.executionClient.Type(),
		"image":      elInspect.Image,
	}).Info("Execution client info")

	logrus.WithFields(logrus.Fields{
		"client":         s.consensusClient.Name(),
		"type":           s.consensusClient.Type(),
		"beacon_api_url": s.consensusClient.BeaconAPIURL(),
		"metrics_url":    s.consensusClient.MetricsURL(),
		"image":          clInspect.Image,
	}).Info("Consensus client info")

	metricsExporterEndpoint, err := s.metricsExporterServiceEndpoint()
	if err != nil {
		return fmt.Errorf("failed to get metrics exporter endpoint: %w", err)
	}

	s.metricsExporterClientFetcher = metrics_exporter.NewClient(s.log, metricsExporterEndpoint)

	logrus.WithFields(logrus.Fields{
		"metrics_url": metricsExporterEndpoint,
	}).Info("Metrics exporter info")

	return nil
}

// Stop cleans up and stops the sync test service
func (s *service) Stop() error {
	s.log.Info("Stopping synctest service")

	if s.cancel != nil {
		s.cancel()
	}
	return nil
}

// WaitForSync waits for the sync to complete
func (s *service) WaitForSync(ctx context.Context) error {
	if s.network == nil {
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
		execSyncStatus, err := s.executionClientFetcher.GetSyncStatus(ctx)
		if err != nil {
			log.Printf("Failed to get execution sync status for %s: %v", s.executionClientFetcher.Name(), err)
		} else {
			gotExecutionSync = true
			logrus.WithFields(logrus.Fields{
				"client":        s.executionClient.Name(),
				"current_block": execSyncStatus.BlockNumber,
				"is_syncing":    execSyncStatus.IsSyncing,
				"peer_count":    execSyncStatus.PeerCount,
			}).Debug("Execution client sync status")

			if execSyncStatus.SyncProgress != nil && execSyncStatus.SyncProgress.CurrentBlock > 0 {
				percent := float64(execSyncStatus.SyncProgress.CurrentBlock) / float64(execSyncStatus.SyncProgress.HighestBlock) * 100
				logrus.WithFields(logrus.Fields{
					"client":         s.executionClient.Name(),
					"current_block":  execSyncStatus.SyncProgress.CurrentBlock,
					"highest_block":  execSyncStatus.SyncProgress.HighestBlock,
					"starting_block": execSyncStatus.SyncProgress.StartingBlock,
					"progress":       fmt.Sprintf("%.2f%%", percent),
				}).Debug("Execution client sync progress")
			}
		}

		// Check consensus client sync status
		consensusSyncStatus, err := s.consensusClientFetcher.GetSyncStatus(ctx)
		if err != nil {
			log.Printf("Failed to get consensus sync status for %s: %v", s.consensusClient.Name(), err)
		} else {
			gotConsensusSync = true
			logrus.WithFields(logrus.Fields{
				"client":        s.consensusClient.Name(),
				"head_slot":     consensusSyncStatus.HeadSlot,
				"sync_distance": consensusSyncStatus.SyncDistance,
				"is_syncing":    consensusSyncStatus.IsSyncing,
				"is_optimistic": consensusSyncStatus.IsOptimistic,
				"el_offline":    consensusSyncStatus.ElOffline,
			}).Debug("Consensus client sync status")

		}

		// Check ethereum metrics exporter metrics
		metrics, err := s.metricsExporterClientFetcher.FetchMetrics(ctx)
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
				"cl_slot_highest":  metrics.ConSyncEstimatedHighestSlot,
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
				"0_cl_progress": fmt.Sprintf("%.2f%%", metrics.ConSyncPercentage),
				"0_el_progress": fmt.Sprintf("%.2f%%", metrics.ExeSyncPercentage),

				"cl_optimistic":   consensusSyncStatus.IsOptimistic,
				"cl_slot":         metrics.ConSyncHeadSlot,
				"cl_slot_highest": metrics.ConSyncEstimatedHighestSlot,
				"cl_syncing":      metrics.ConIsSyncing,
				"cl_type":         s.cfg.CLClient,

				"el_block_highest": metrics.ExeSyncHighestBlock,
				"el_block":         metrics.ExeSyncCurrentBlock,
				"el_chain_id":      metrics.ExeChainID,
				"el_syncing":       metrics.ExeIsSyncing,
				"el_type":          s.cfg.ELClient,
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
			s.reportService.SetBlockNumber(ctx, blockNumber)

			// Convert slot string to uint64
			slotNumber, err := strconv.ParseUint(consensusSyncStatus.HeadSlot, 10, 64)
			if err != nil {
				slotNumber = 0 // Default to 0 if conversion fails
			}
			s.reportService.SetSlotNumber(ctx, slotNumber)

			s.reportService.SetExecutionClientInfo(ctx, &report.ClientInfo{
				Version: metrics.ExeVersion,
			})
			s.reportService.SetConsensusClientInfo(ctx, &report.ClientInfo{
				Version: metrics.ConVersion,
			})

			progressEntry := report.SyncProgressEntry{
				T:                        timestamp,
				Block:                    blockNumber,
				Slot:                     slotNumber,
				DiskUsageExecutionClient: metrics.ExeDiskUsage,
				DiskUsageConsensusClient: metrics.ConDiskUsage,
				PeersExecutionClient:     metrics.ExePeers,
				PeersConsensusClient:     metrics.ConPeers,
			}

			s.reportService.AddSyncProgressEntry(ctx, progressEntry)
		}

		// Check if we are synced and exit the loop
		if gotExecutionSync && gotConsensusSync &&
			consensusSyncStatus.IsOptimistic == false &&
			consensusSyncStatus.IsSyncing == false &&
			execSyncStatus.IsSyncing == false &&
			execSyncStatus.BlockNumber > 0 {

			// Stop report service
			if err := s.reportService.Stop(ctx); err != nil {
				return fmt.Errorf("failed to stop report service: %w", err)
			}

			// Save report
			baseName := fmt.Sprintf("%s_%s_%s", s.cfg.Network, s.cfg.ELClient, s.cfg.CLClient)
			if err := s.reportService.SaveReportToFiles(ctx, baseName, s.cfg.ReportDir); err != nil {
				return fmt.Errorf("failed to save report: %w", err)
			}

			logrus.WithFields(logrus.Fields{
				"enclave":          s.network.EnclaveName(),
				"execution_client": s.executionClient.Name(),
				"consensus_client": s.consensusClient.Name(),
				"current_block":    execSyncStatus.BlockNumber,
			}).Info("Execution and consensus clients are synced")

			return nil
		}

		time.Sleep(s.cfg.CheckInterval)
	}
}

func boolPtr(b bool) *bool {
	return &b
}

func (s *service) metricsExporterServiceEndpoint() (string, error) {
	name := fmt.Sprintf("ethereum-metrics-exporter-1-%s-%s", s.cfg.CLClient, s.cfg.ELClient)
	kservice, err := s.kurtosisClient.InspectService(s.network.EnclaveName(), name)
	if err != nil {
		return "", fmt.Errorf("failed to inspect metrics exporter service: %w", err)
	}
	return fmt.Sprintf("http://127.0.0.1:%d/metrics", kservice.PublicPorts["http"].Number), nil
}

// Interface compliance check
var _ Service = (*service)(nil)
