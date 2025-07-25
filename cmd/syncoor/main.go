package main

import (
	"fmt"
	"log"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var (
	// Global flags
	logLevel       string //nolint: gochecknoglobals
	logForceColors bool   //nolint: gochecknoglobals

	// Version information (set during build)
	Version = "unknown" //nolint: gochecknoglobals
)

var rootCmd = &cobra.Command{
	Use:   "syncoor",
	Short: "Test Ethereum client synchronization",
	Long:  "A tool to test and monitor Ethereum execution and consensus client synchronization",
}

func init() {
	// Global flags
	rootCmd.PersistentFlags().StringVar(&logLevel, "log-level", "info", "Log level (panic, fatal, error, warn, info, debug, trace)")
	rootCmd.PersistentFlags().BoolVar(&logForceColors, "log-force-colors", false, "Force colored output in logs")

	// Configure log level
	level, err := logrus.ParseLevel(logLevel)
	if err != nil {
		level = logrus.InfoLevel
	}
	logrus.SetLevel(level)

	formatter := &logrus.TextFormatter{
		FullTimestamp: true,
	}

	// Configure log colors
	if logForceColors {
		formatter.ForceColors = true
	}

	logrus.SetFormatter(formatter)

	// Add commands to root
	rootCmd.AddCommand(NewSyncCommand())
	rootCmd.AddCommand(NewServerCommand())
	rootCmd.AddCommand(NewReportIndexCommand())
	rootCmd.AddCommand(newVersionCommand())
	rootCmd.AddCommand(NewSysinfoCommand())
}

func newVersionCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Show version information",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("%s-%s\n", rootCmd.Use, Version)
		},
	}
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		log.Fatalf("Failed to execute command: %v", err)
	}
}
