package main

import (
	"log"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var (
	// Global flags
	logLevel string
)

var rootCmd = &cobra.Command{
	Use:   "syncoor",
	Short: "Test Ethereum client synchronization",
	Long:  "A tool to test and monitor Ethereum execution and consensus client synchronization",
}

func init() {
	// Global flags
	rootCmd.PersistentFlags().StringVar(&logLevel, "log-level", "info", "Log level (panic, fatal, error, warn, info, debug, trace)")

	// Configure log level
	level, err := logrus.ParseLevel(logLevel)
	if err != nil {
		level = logrus.InfoLevel
	}
	logrus.SetLevel(level)

	// Add commands to root
	rootCmd.AddCommand(NewSyncCommand())
	rootCmd.AddCommand(NewServerCommand())
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		log.Fatalf("Failed to execute command: %v", err)
	}
}
