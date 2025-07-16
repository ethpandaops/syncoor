package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var (
	checkInterval time.Duration
	elClient      string
	clClient      string
	elImage       string
	clImage       string
	networkName   string
	enclaveName   string
	reportDir     string
)

var rootCmd = &cobra.Command{
	Use:   "sync_test",
	Short: "Test Ethereum client synchronization",
	Long:  "A tool to test and monitor Ethereum execution and consensus client synchronization",
	Run:   runSyncTest,
}

func init() {
	rootCmd.Flags().DurationVar(&checkInterval, "check-interval", 10*time.Second, "Interval in seconds between sync status checks")
	rootCmd.Flags().StringVar(&elClient, "el-client", "geth", "Execution layer client type (geth, besu, nethermind, erigon, reth)")
	rootCmd.Flags().StringVar(&clClient, "cl-client", "teku", "Consensus layer client type (lighthouse, teku, prysm, nimbus, lodestar, grandine)")
	rootCmd.Flags().StringVar(&elImage, "el-image", "", "Execution layer client image (optional)")
	rootCmd.Flags().StringVar(&clImage, "cl-image", "", "Consensus layer client image (optional)")
	rootCmd.Flags().StringVar(&networkName, "network", "hoodi", "Network to connect to (e.g., hoodi, sepolia, mainnet)")
	rootCmd.Flags().StringVar(&enclaveName, "enclave", "", "Enclave name (optional - defaults to sync-test-$network-$el-client-$cl-client)")
	rootCmd.Flags().StringVar(&reportDir, "report-dir", "./reports", "Directory to save reports (defaults to ./reports)")
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		log.Fatalf("Failed to execute command: %v", err)
	}
}

func runSyncTest(cmd *cobra.Command, args []string) {
	ctx := context.Background()

	// Set default enclave name if not provided
	if enclaveName == "" {
		enclaveName = fmt.Sprintf("sync-test-%s-%s-%s", networkName, elClient, clClient)
	}

	// Create sync test config from command line flags
	config := SyncTestConfig{
		CheckInterval: checkInterval,
		ELClient:      elClient,
		CLClient:      clClient,
		ELImage:       elImage,
		CLImage:       clImage,
		Network:       networkName,
		EnclaveName:   enclaveName,
		ReportDir:     reportDir,
	}

	// Create new sync test instance
	syncTest := NewSyncTest(config)

	// Start the network
	if err := syncTest.Start(ctx); err != nil {
		log.Fatalf("Failed to start sync test: %v", err)
	}

	logrus.WithFields(logrus.Fields{
		"enclave":           syncTest.network.EnclaveName(),
		"execution_clients": len(syncTest.network.ExecutionClients().All()),
		"consensus_clients": len(syncTest.network.ConsensusClients().All()),
	}).Info("Network info")

	// Start sync checking
	if err := syncTest.WaitForSync(ctx); err != nil {
		if err == context.Canceled {
			fmt.Println("Context cancelled, shutting down...")
		} else {
			log.Fatalf("Sync check failed: %v", err)
		}
	}

	// Save the sync test report to file
	if err := syncTest.SaveReportToFile(); err != nil {
		log.Printf("Warning: Failed to save report to file: %v", err)
	}
}
