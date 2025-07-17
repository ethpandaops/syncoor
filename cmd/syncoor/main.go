package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/ethpandaops/syncoor/pkg/synctest"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var (
	checkInterval time.Duration
	runTimeout    time.Duration
	elClient      string
	clClient      string
	elImage       string
	clImage       string
	networkName   string
	enclaveName   string
	reportDir     string
	logLevel      string
	labels        []string
)

var rootCmd = &cobra.Command{
	Use:   "syncoor",
	Short: "Test Ethereum client synchronization",
	Long:  "A tool to test and monitor Ethereum execution and consensus client synchronization",
	Run:   runSyncTest,
}

func init() {
	rootCmd.Flags().DurationVar(&checkInterval, "check-interval", 10*time.Second, "Interval in seconds between sync status checks")
	rootCmd.Flags().DurationVar(&runTimeout, "run-timeout", 5*time.Minute, "Timeout in minutes for network startup")
	rootCmd.Flags().StringVar(&elClient, "el-client", "geth", "Execution layer client type (geth, besu, nethermind, erigon, reth)")
	rootCmd.Flags().StringVar(&clClient, "cl-client", "teku", "Consensus layer client type (lighthouse, teku, prysm, nimbus, lodestar, grandine)")
	rootCmd.Flags().StringVar(&elImage, "el-image", "", "Execution layer client image (optional)")
	rootCmd.Flags().StringVar(&clImage, "cl-image", "", "Consensus layer client image (optional)")
	rootCmd.Flags().StringVar(&networkName, "network", "hoodi", "Network to connect to (e.g., hoodi, sepolia, mainnet)")
	rootCmd.Flags().StringVar(&enclaveName, "enclave", "", "Enclave name (optional - defaults to sync-test-$network-$el-client-$cl-client)")
	rootCmd.Flags().StringVar(&reportDir, "report-dir", "./reports", "Directory to save reports (defaults to ./reports)")
	rootCmd.Flags().StringVar(&logLevel, "log-level", "info", "Log level (panic, fatal, error, warn, info, debug, trace)")
	rootCmd.Flags().StringSliceVar(&labels, "label", []string{}, "Labels in key=value format (can be used multiple times)")
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		log.Fatalf("Failed to execute command: %v", err)
	}
}

func runSyncTest(cmd *cobra.Command, args []string) {
	ctx := context.Background()

	// Configure log level
	level, err := logrus.ParseLevel(logLevel)
	if err != nil {
		log.Fatalf("Invalid log level '%s': %v", logLevel, err)
	}
	logrus.SetLevel(level)

	// Create logger instance
	logger := logrus.WithField("component", "main")

	// Set default enclave name if not provided
	if enclaveName == "" {
		enclaveName = fmt.Sprintf("sync-test-%s-%s-%s", networkName, elClient, clClient)
	}

	// Create sync test config from command line flags
	config := synctest.Config{
		CheckInterval: checkInterval,
		RunTimeout:    runTimeout,
		ELClient:      elClient,
		CLClient:      clClient,
		ELImage:       elImage,
		CLImage:       clImage,
		Network:       networkName,
		EnclaveName:   enclaveName,
		ReportDir:     reportDir,
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
	syncTestService := synctest.NewService(logger, config)

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

}
