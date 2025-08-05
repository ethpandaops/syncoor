package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ethpandaops/syncoor/pkg/kurtosis"
	"github.com/ethpandaops/syncoor/pkg/recovery"
	"github.com/ethpandaops/syncoor/pkg/synctest"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

func NewSyncCommand() *cobra.Command {
	var (
		// Sync command flags
		checkInterval         time.Duration
		runTimeout            time.Duration
		elClient              string
		clClient              string
		elImage               string
		clImage               string
		elExtraArgs           []string
		clExtraArgs           []string
		networkName           string
		enclaveName           string
		reportDir             string
		labels                []string
		serverURL             string
		serverAuth            string
		enableRecovery        bool
		clientLogs            bool
		supernode             bool
		checkpointSyncEnabled bool
		checkpointSyncURL     string
	)

	cmd := &cobra.Command{
		Use:   "sync",
		Short: "Run synchronization test",
		Long:  "Run a synchronization test for Ethereum execution and consensus clients",
		Run: func(cmd *cobra.Command, args []string) {
			// Create cancellable context for signal handling
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			// Create logger instance
			logger := logrus.WithField("component", "sync")

			// Set default enclave name if not provided
			if enclaveName == "" {
				enclaveName = fmt.Sprintf("sync-test-%s-%s-%s", networkName, elClient, clClient)
			}

			// Create sync test config from command line flags
			config := synctest.Config{
				CheckInterval:         checkInterval,
				RunTimeout:            runTimeout,
				ELClient:              elClient,
				CLClient:              clClient,
				ELImage:               elImage,
				CLImage:               clImage,
				ELExtraArgs:           elExtraArgs,
				CLExtraArgs:           clExtraArgs,
				Network:               networkName,
				EnclaveName:           enclaveName,
				ReportDir:             reportDir,
				ServerURL:             serverURL,
				ServerAuth:            serverAuth,
				ClientLogs:            clientLogs,
				Supernode:             supernode,
				CheckpointSyncEnabled: checkpointSyncEnabled,
				CheckpointSyncURL:     checkpointSyncURL,
			}

			// Parse labels
			parsedLabels := make(map[string]string)
			for _, label := range labels {
				parts := strings.SplitN(label, "=", 2)
				if len(parts) == 2 {
					parsedLabels[parts[0]] = parts[1]
				} else {
					logger.Warnf("Invalid label format '%s', skipping", label)
				}
			}
			config.Labels = parsedLabels

			// Create new sync test service
			syncTestService := synctest.NewService(logger, config, Version)

			// Enable recovery if requested
			if enableRecovery {
				logger.Info("Recovery mode enabled")
				kurtosisClient := kurtosis.NewClient(logger)
				recoveryService := recovery.NewService(kurtosisClient, logger)
				syncTestService.EnableRecovery(recoveryService)
			}

			// Setup signal handling for graceful shutdown
			setupSignalHandling(ctx, cancel, syncTestService, logger)

			// Start the service
			if err := syncTestService.Start(ctx); err != nil {
				logger.Fatalf("Failed to start sync test: %v", err)
			}
			defer func() {
				if err := syncTestService.Stop(); err != nil {
					logger.Errorf("Failed to stop sync test service: %v", err)
				}
			}()

			// Wait for sync to complete
			if err := syncTestService.WaitForSync(ctx); err != nil {
				if err == context.Canceled {
					logger.Info("Context cancelled, shutting down...")
				} else {
					logger.Fatalf("Sync check failed: %v", err)
				}
			}
		},
	}

	// Sync command flags
	cmd.Flags().DurationVar(&checkInterval, "check-interval", 10*time.Second, "Interval in seconds between sync status checks")
	cmd.Flags().DurationVar(&runTimeout, "run-timeout", 60*time.Minute,
		"Timeout for sync operation - will cancel sync and generate report marked as 'timeout' if exceeded")
	cmd.Flags().StringVar(&elClient, "el-client", "geth", "Execution layer client type (geth, besu, nethermind, erigon, reth)")
	cmd.Flags().StringVar(&clClient, "cl-client", "teku", "Consensus layer client type (lighthouse, teku, prysm, nimbus, lodestar, grandine)")
	cmd.Flags().StringVar(&elImage, "el-image", "", "Execution layer client image (optional)")
	cmd.Flags().StringVar(&clImage, "cl-image", "", "Consensus layer client image (optional)")
	cmd.Flags().StringSliceVar(&elExtraArgs, "el-extra-args", []string{}, "Extra arguments for execution layer client (can be used multiple times)")
	cmd.Flags().StringSliceVar(&clExtraArgs, "cl-extra-args", []string{}, "Extra arguments for consensus layer client (can be used multiple times)")
	cmd.Flags().StringVar(&networkName, "network", "hoodi", "Network to connect to (e.g., hoodi, sepolia, mainnet)")
	cmd.Flags().StringVar(&enclaveName, "enclave", "", "Enclave name (optional - defaults to sync-test-$network-$el-client-$cl-client)")
	cmd.Flags().StringVar(&reportDir, "report-dir", "./reports", "Directory to save reports (defaults to ./reports)")
	cmd.Flags().StringSliceVar(&labels, "label", []string{}, "Labels in key=value format (can be used multiple times)")
	cmd.Flags().StringVar(&serverURL, "server", "", "Centralized server URL (e.g., https://api.syncoor.example)")
	cmd.Flags().StringVar(&serverAuth, "server-auth", "", "Bearer token for server authentication")
	cmd.Flags().BoolVar(&enableRecovery, "enable-recovery", true, "Enable recovery from interrupted sync operations")
	cmd.Flags().BoolVar(&clientLogs, "client-logs", false, "Output EL and CL client logs to stdout")
	cmd.Flags().BoolVar(&supernode, "supernode", false, "Enable supernode (should only be used with peerdas)")
	cmd.Flags().BoolVar(&checkpointSyncEnabled, "checkpoint-sync-enabled", true, "Enable checkpoint sync across the network")
	cmd.Flags().StringVar(&checkpointSyncURL, "checkpoint-sync-url", "", "Checkpoint sync URL (e.g., https://checkpoint-sync.sepolia.ethpandaops.io/)")

	return cmd
}

// setupSignalHandling sets up signal handlers for graceful shutdown
func setupSignalHandling(ctx context.Context, cancel context.CancelFunc, service synctest.Service, logger *logrus.Entry) {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		select {
		case sig := <-sigChan:
			logger.WithField("signal", sig).Info("Received signal, saving progress and shutting down")
			// Set cancelled status before saving temp report
			if reportService, ok := service.(interface {
				SetSyncStatus(ctx context.Context, status string, message string) error
			}); ok {
				cancelMessage := fmt.Sprintf("Sync operation cancelled by %s signal", sig)
				if err := reportService.SetSyncStatus(ctx, "cancelled", cancelMessage); err != nil {
					logger.WithError(err).Warn("Failed to set cancelled status")
				}
			}
			if err := service.SaveTempReport(ctx); err != nil {
				logger.WithError(err).Error("Failed to save temp report")
			}
			cancel()
		case <-ctx.Done():
			return
		}
	}()
}
