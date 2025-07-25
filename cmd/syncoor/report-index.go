package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/ethpandaops/syncoor/pkg/report"
	"github.com/fsnotify/fsnotify"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

func NewReportIndexCommand() *cobra.Command {
	var (
		reportDir  string
		outputPath string
		watch      bool
	)

	cmd := &cobra.Command{
		Use:   "report-index",
		Short: "Generate an index of sync test reports",
		Long:  "Scans a directory for sync test reports and generates an index file containing metadata about each report",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()

			// Create logger instance
			logger := logrus.WithField("component", "report-index")

			// Create index service
			indexService := report.NewIndexService(logger)

			// Determine output path
			if outputPath == "" {
				outputPath = filepath.Join(reportDir, "index.json")
			}

			// Generate initial index
			if err := generateIndex(ctx, indexService, logger, reportDir, outputPath); err != nil {
				return err
			}

			// If watch mode is disabled, exit after generating the index
			if !watch {
				return nil
			}

			// Watch mode: monitor for changes and regenerate index
			return watchAndRegenerate(ctx, indexService, logger, reportDir, outputPath)
		},
	}

	// Add flags
	cmd.Flags().StringVar(&reportDir, "report-dir", "./reports", "Directory containing sync test reports")
	cmd.Flags().StringVar(&outputPath, "output", "", "Output path for the index file (defaults to {report-dir}/index.json)")
	cmd.Flags().BoolVar(&watch, "watch", false, "Watch for changes and automatically regenerate the index")

	return cmd
}

// generateIndex creates and saves an index of sync test reports
func generateIndex(ctx context.Context, indexService report.IndexService, logger *logrus.Entry, reportDir, outputPath string) error {
	// Generate index
	logger.WithField("reportDir", reportDir).Info("Generating report index")
	index, err := indexService.GenerateIndex(ctx, reportDir)
	if err != nil {
		return fmt.Errorf("failed to generate index: %w", err)
	}

	// Save index
	logger.WithField("outputPath", outputPath).Info("Saving index")
	if err := indexService.SaveIndex(ctx, index, outputPath); err != nil {
		return fmt.Errorf("failed to save index: %w", err)
	}

	logger.WithField("entriesCount", len(index.Entries)).Info("Report index generated successfully")
	return nil
}

// watchAndRegenerate monitors the reports directory for changes and regenerates the index
func watchAndRegenerate(ctx context.Context, indexService report.IndexService, logger *logrus.Entry, reportDir, outputPath string) error {
	// Create file system watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("failed to create file watcher: %w", err)
	}
	defer func() {
		if err := watcher.Close(); err != nil {
			logger.WithError(err).Error("Failed to close file watcher")
		}
	}()

	// Add the reports directory to the watcher
	if err := watcher.Add(reportDir); err != nil {
		return fmt.Errorf("failed to watch directory %s: %w", reportDir, err)
	}

	logger.WithField("reportDir", reportDir).Info("Watching for changes in reports directory")

	// Set up signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Debounce timer to avoid regenerating index too frequently
	var debounceTimer *time.Timer
	const debounceDelay = 2 * time.Second

	return watchLoop(ctx, watcher, sigChan, indexService, logger, reportDir, outputPath, &debounceTimer, debounceDelay)
}

// watchLoop handles the main event loop for file watching
func watchLoop(
	ctx context.Context,
	watcher *fsnotify.Watcher,
	sigChan <-chan os.Signal,
	indexService report.IndexService,
	logger *logrus.Entry,
	reportDir, outputPath string,
	debounceTimer **time.Timer,
	debounceDelay time.Duration,
) error {
	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return nil
			}
			handleFileEvent(event, indexService, logger, reportDir, outputPath, debounceTimer, debounceDelay, ctx)

		case err, ok := <-watcher.Errors:
			if !ok {
				return nil
			}
			logger.WithError(err).Error("File watcher error")

		case <-sigChan:
			return handleShutdown(logger, debounceTimer, "Received shutdown signal, stopping watch mode")

		case <-ctx.Done():
			err := handleShutdown(logger, debounceTimer, "Context cancelled, stopping watch mode")
			if err != nil {
				return err
			}
			return fmt.Errorf("context cancelled: %w", ctx.Err())
		}
	}
}

// handleFileEvent processes file system events for .main.json files
func handleFileEvent(
	event fsnotify.Event,
	indexService report.IndexService,
	logger *logrus.Entry,
	reportDir, outputPath string,
	debounceTimer **time.Timer,
	debounceDelay time.Duration,
	ctx context.Context,
) {
	// Only process events for .main.json files
	if !strings.HasSuffix(event.Name, ".main.json") {
		return
	}

	// Log the event for debugging
	logger.WithFields(logrus.Fields{
		"file": event.Name,
		"op":   event.Op.String(),
	}).Debug("File system event detected")

	// Reset or create debounce timer
	if *debounceTimer != nil {
		(*debounceTimer).Stop()
	}
	*debounceTimer = time.AfterFunc(debounceDelay, func() {
		logger.Info("Changes detected, regenerating index...")
		if err := generateIndex(ctx, indexService, logger, reportDir, outputPath); err != nil {
			logger.WithError(err).Error("Failed to regenerate index")
		}
	})
}

// handleShutdown handles graceful shutdown by stopping debounce timer
func handleShutdown(logger *logrus.Entry, debounceTimer **time.Timer, message string) error {
	logger.Info(message)
	if *debounceTimer != nil {
		(*debounceTimer).Stop()
	}
	return nil
}
