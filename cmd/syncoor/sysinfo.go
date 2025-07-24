package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/ethpandaops/syncoor/pkg/sysinfo"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

func NewSysinfoCommand() *cobra.Command {
	var pretty bool

	cmd := &cobra.Command{
		Use:   "sysinfo",
		Short: "Display system information. ",
		Long:  "Display system information. This data will be used to identify the system running the sync tests.",
		RunE: func(cmd *cobra.Command, args []string) error {
			// Create a logger with minimal output
			logger := logrus.New()
			logger.SetLevel(logrus.WarnLevel) // Only show warnings and errors
			logger.SetOutput(os.Stderr)       // Log to stderr so stdout is clean JSON

			// Create sysinfo service
			service := sysinfo.NewService(logger)

			// Set syncoor version if available
			if Version != "unknown" {
				service.SetSyncoorVersion(Version)
			}

			// Get system information
			ctx := context.Background()
			info, err := service.GetSystemInfo(ctx)
			if err != nil {
				return fmt.Errorf("failed to get system info: %w", err)
			}

			// Marshal to JSON
			var output []byte
			if pretty {
				output, err = json.MarshalIndent(info, "", "  ")
			} else {
				output, err = json.Marshal(info)
			}
			if err != nil {
				return fmt.Errorf("failed to marshal system info: %w", err)
			}

			// Print to stdout
			fmt.Println(string(output))
			return nil
		},
	}

	// Add flags
	cmd.Flags().BoolVar(&pretty, "pretty", false, "Pretty print JSON output")

	return cmd
}
