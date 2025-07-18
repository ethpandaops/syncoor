package main

import (
	"fmt"
	"path/filepath"

	"github.com/ethpandaops/syncoor/pkg/report"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

func NewReportIndexCommand() *cobra.Command {
	var (
		reportDir  string
		outputPath string
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

			// Generate index
			logger.WithField("reportDir", reportDir).Info("Generating report index")
			index, err := indexService.GenerateIndex(ctx, reportDir)
			if err != nil {
				return fmt.Errorf("failed to generate index: %w", err)
			}

			// Determine output path
			if outputPath == "" {
				outputPath = filepath.Join(reportDir, "index.json")
			}

			// Save index
			logger.WithField("outputPath", outputPath).Info("Saving index")
			if err := indexService.SaveIndex(ctx, index, outputPath); err != nil {
				return fmt.Errorf("failed to save index: %w", err)
			}

			logger.WithField("entriesCount", len(index.Entries)).Info("Report index generated successfully")
			return nil
		},
	}

	// Add flags
	cmd.Flags().StringVar(&reportDir, "report-dir", "./reports", "Directory containing sync test reports")
	cmd.Flags().StringVar(&outputPath, "output", "", "Output path for the index file (defaults to {report-dir}/index.json)")

	return cmd
}
