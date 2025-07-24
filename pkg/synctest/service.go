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
	"github.com/ethpandaops/syncoor/pkg/recovery"
	"github.com/ethpandaops/syncoor/pkg/report"
	"github.com/ethpandaops/syncoor/pkg/reporting"
	"github.com/ethpandaops/syncoor/pkg/sysinfo"
)

// Service defines the interface for the sync test service
type Service interface {
	Start(ctx context.Context) error
	Stop() error
	WaitForSync(ctx context.Context) error

	// Recovery methods
	EnableRecovery(recovery.Service)
	SaveTempReport(ctx context.Context) error
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
	reportingClient              *reporting.Client

	// Recovery support
	recoveryService recovery.Service
	tempReportSaved bool
	recoveredReport *report.Result

	// Completion state
	testCompleted bool

	// Version information
	syncoorVersion string

	cancel context.CancelFunc
}

// Verify interface compliance at compile time
var _ Service = (*service)(nil)

// NewService creates a new sync test service
func NewService(
	log logrus.FieldLogger,
	cfg Config,
	version string,
) Service {
	svc := &service{
		log:            log.WithField("package", "synctest"),
		cfg:            cfg,
		kurtosisClient: kurtosis.NewClient(log),
		reportService:  report.NewService(log),
	}

	// Store version for sysinfo
	svc.syncoorVersion = version

	// Initialize reporting client if configured
	if cfg.ServerURL != "" {
		svc.reportingClient = reporting.NewClient(
			cfg.ServerURL,
			cfg.ServerAuth,
			log.WithField("component", "reporting"),
		)
	}

	return svc
}

// Start initializes the synctest service
func (s *service) Start(ctx context.Context) error {
	s.log.Info("Starting synctest service")

	ctx, cancel := context.WithCancel(ctx)
	s.cancel = cancel

	// Start reporting client if configured
	if s.reportingClient != nil {
		s.reportingClient.Start(ctx)
	}

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

	// Check for recovery opportunity if recovery service is enabled
	if s.recoveryService != nil {
		// Convert synctest.Config to recovery.Config
		recoveryConfig := &recovery.Config{
			Network:     s.cfg.Network,
			ELClient:    s.cfg.ELClient,
			CLClient:    s.cfg.CLClient,
			ELImage:     s.cfg.ELImage,
			CLImage:     s.cfg.CLImage,
			ELExtraArgs: s.cfg.ELExtraArgs,
			CLExtraArgs: s.cfg.CLExtraArgs,
			EnclaveName: s.cfg.EnclaveName,
		}

		recoveryState, err := s.recoveryService.CheckRecoverable(ctx, recoveryConfig)
		if err != nil {
			s.log.WithError(err).Warn("Failed to check recoverable state, proceeding with fresh start")
		} else if recoveryState != nil {
			s.log.WithField("enclave", recoveryState.EnclaveName).Info("Found recoverable state, validating enclave")

			// Validate the enclave is in good state
			if err := s.recoveryService.ValidateEnclave(ctx, recoveryState.EnclaveName, recoveryConfig); err != nil {
				s.log.WithError(err).Warn("Enclave validation failed, proceeding with fresh start")
			} else {
				s.log.Info("Enclave validation successful, attempting recovery")

				// Load temporary report if available
				if tempReport, err := s.reportService.LoadTempReport(ctx, s.cfg.Network, s.cfg.ELClient, s.cfg.CLClient); err != nil {
					s.log.WithError(err).Warn("Failed to load temp report, but continuing with recovery")
				} else if tempReport != nil {
					s.log.WithField("progress_entries", len(tempReport.SyncStatus.SyncProgress)).Info("Loaded temporary report for recovery")
					// Store the recovered report to restore after report service starts
					s.recoveredReport = tempReport
				}
			}
		} else {
			s.log.Info("No recoverable state found, proceeding with fresh start")
		}
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

	// Set network in report
	if err := s.reportService.SetNetwork(ctx, s.cfg.Network); err != nil {
		return fmt.Errorf("failed to set network in report: %w", err)
	}

	// Set labels in report
	if err := s.reportService.SetLabels(ctx, s.cfg.Labels); err != nil {
		return fmt.Errorf("failed to set labels in report: %w", err)
	}

	// Restore recovered report state if available
	if s.recoveredReport != nil {
		s.log.WithField("progress_entries", len(s.recoveredReport.SyncStatus.SyncProgress)).Info("Restoring progress from recovered report")
		if err := s.reportService.RestoreReportState(ctx, s.recoveredReport); err != nil {
			s.log.WithError(err).Warn("Failed to restore report state from recovery")
		} else {
			s.log.Info("Successfully restored report state from recovery")
		}
	}

	s.network = network

	// Collect system information
	sysInfoService := sysinfo.NewService(s.log)
	sysInfoService.SetSyncoorVersion(s.syncoorVersion)
	systemInfo, err := sysInfoService.GetSystemInfo(ctx)
	if err != nil {
		s.log.WithError(err).Warn("Failed to collect system information")
		// Continue anyway - system info is optional
	} else {
		// Set system info in report service
		if err := s.reportService.SetSystemInfo(ctx, systemInfo); err != nil {
			s.log.WithError(err).Warn("Failed to set system info in report")
		}
	}

	// Report test start if reporting client is configured
	if s.reportingClient != nil {
		runID := fmt.Sprintf("sync-test-%d-%s_%s_%s", time.Now().UnixNano(), s.cfg.Network, s.cfg.ELClient, s.cfg.CLClient)
		startReq := reporting.TestKeepaliveRequest{
			RunID:     runID,
			Timestamp: time.Now().Unix(),
			Network:   s.cfg.Network,
			Labels:    s.cfg.Labels,
			ELClient: reporting.ClientConfig{
				Type:      s.cfg.ELClient,
				Image:     s.cfg.ELImage,
				ExtraArgs: s.cfg.ELExtraArgs,
			},
			CLClient: reporting.ClientConfig{
				Type:      s.cfg.CLClient,
				Image:     s.cfg.CLImage,
				ExtraArgs: s.cfg.CLExtraArgs,
			},
			EnclaveName: s.cfg.EnclaveName,
			SystemInfo:  systemInfo,
		}

		if err := s.reportingClient.ReportTestKeepAlive(ctx, startReq); err != nil {
			s.log.WithError(err).Warn("Failed to report test start")
			// Continue anyway - reporting is optional
		}
	}

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

	if s.reportingClient != nil {
		s.reportingClient.Stop()
	}

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

			// Periodically save temp report for recovery (every 10 progress entries)
			if s.recoveryService != nil && len(s.getCurrentProgressEntries())%10 == 0 {
				if err := s.SaveTempReport(ctx); err != nil {
					s.log.WithError(err).Warn("Failed to save periodic temp report")
				}
			}

			// Report progress to centralized server if configured and test not completed
			if s.reportingClient != nil && !s.testCompleted {
				progressMetrics := reporting.ProgressMetrics{
					Block:           blockNumber,
					Slot:            slotNumber,
					ExecDiskUsage:   metrics.ExeDiskUsage,
					ConsDiskUsage:   metrics.ConDiskUsage,
					ExecPeers:       metrics.ExePeers,
					ConsPeers:       metrics.ConPeers,
					ExecSyncPercent: metrics.ExeSyncPercentage,
					ConsSyncPercent: metrics.ConSyncPercentage,
					ExecVersion:     metrics.ExeVersion,
					ConsVersion:     metrics.ConVersion,
				}
				s.reportingClient.ReportProgress(progressMetrics) // Non-blocking
			}
		}

		// Check if we are synced and exit the loop
		if gotExecutionSync && gotConsensusSync &&
			consensusSyncStatus.IsOptimistic == false &&
			consensusSyncStatus.IsSyncing == false &&
			execSyncStatus.IsSyncing == false &&
			execSyncStatus.BlockNumber > 0 {

			// Mark test as completed to prevent further progress reports
			s.testCompleted = true

			// Report completion to centralized server if configured
			if s.reportingClient != nil {
				finalSlot, _ := strconv.ParseUint(consensusSyncStatus.HeadSlot, 10, 64)
				completeReq := reporting.TestCompleteRequest{
					Timestamp:  time.Now().Unix(),
					FinalBlock: execSyncStatus.BlockNumber,
					FinalSlot:  finalSlot,
					Success:    true,
				}

				if err := s.reportingClient.ReportTestComplete(ctx, completeReq); err != nil {
					s.log.WithError(err).Warn("Failed to report test completion")
				}
			}

			// Stop report service
			if err := s.reportService.Stop(ctx); err != nil {
				return fmt.Errorf("failed to stop report service: %w", err)
			}

			// Save report
			baseName := fmt.Sprintf("%s_%s_%s", s.cfg.Network, s.cfg.ELClient, s.cfg.CLClient)
			if err := s.reportService.SaveReportToFiles(ctx, baseName, s.cfg.ReportDir); err != nil {
				return fmt.Errorf("failed to save report: %w", err)
			}

			// Clean up temporary reports on successful completion
			if s.recoveryService != nil {
				if err := s.reportService.RemoveTempReport(ctx, s.cfg.Network, s.cfg.ELClient, s.cfg.CLClient); err != nil {
					s.log.WithError(err).Warn("Failed to clean up temporary reports")
				} else {
					s.log.Info("Cleaned up temporary reports after successful completion")
				}
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

// EnableRecovery enables the recovery service for this sync test
func (s *service) EnableRecovery(recoveryService recovery.Service) {
	s.recoveryService = recoveryService
	s.log.Info("Recovery service enabled")
}

// SaveTempReport saves a temporary report for recovery purposes
func (s *service) SaveTempReport(ctx context.Context) error {
	if s.recoveryService == nil {
		s.log.Debug("Recovery service not enabled, skipping temp report save")
		return nil
	}

	// Get current report state from the report service
	currentReport, err := s.reportService.GetCurrentReport(ctx)
	if err != nil {
		s.log.WithError(err).Warn("Failed to get current report, creating basic temp report")
		currentReport = s.createBasicReport()
	}

	// Ensure we have the basic configuration in the report
	if currentReport.Network == "" {
		currentReport.Network = s.cfg.Network
	}
	if currentReport.ExecutionClientInfo.Type == "" {
		currentReport.ExecutionClientInfo.Type = s.cfg.ELClient
	}
	if currentReport.ConsensusClientInfo.Type == "" {
		currentReport.ConsensusClientInfo.Type = s.cfg.CLClient
	}

	// Save temporary report with current progress
	if err := s.reportService.SaveTempReport(ctx, currentReport); err != nil {
		return fmt.Errorf("failed to save temp report: %w", err)
	}

	s.tempReportSaved = true
	s.log.WithField("progress_entries", len(currentReport.SyncStatus.SyncProgress)).Info("Temporary report saved for recovery")
	return nil
}

// createBasicReport creates a basic report structure as fallback
func (s *service) createBasicReport() *report.Result {
	return &report.Result{
		Network: s.cfg.Network,
		ExecutionClientInfo: report.ClientInfo{
			Type: s.cfg.ELClient,
		},
		ConsensusClientInfo: report.ClientInfo{
			Type: s.cfg.CLClient,
		},
		SyncStatus: report.SyncStatus{
			SyncProgress: make([]report.SyncProgressEntry, 0),
		},
	}
}

// getCurrentProgressEntries gets the current progress entries from the report service
func (s *service) getCurrentProgressEntries() []report.SyncProgressEntry {
	currentReport, err := s.reportService.GetCurrentReport(context.Background())
	if err != nil {
		return []report.SyncProgressEntry{}
	}
	return currentReport.SyncStatus.SyncProgress
}

// Interface compliance check
var _ Service = (*service)(nil)
