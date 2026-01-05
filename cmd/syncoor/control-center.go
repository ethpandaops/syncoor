package main

import (
	"context"
	"fmt"

	"github.com/ethpandaops/syncoor/pkg/controlcenter"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

func NewControlCenterCommand() *cobra.Command {
	var configPath string
	var listen string
	var corsOrigins string

	cmd := &cobra.Command{
		Use:   "control-center",
		Short: "Run Syncoor in Control Center mode",
		Long: `Starts a Control Center server that aggregates data from multiple Syncoor API instances.

The Control Center provides a unified view of all sync tests across all configured
Syncoor deployments, showing running jobs, instance health, and historical data.

Configuration can be provided via a YAML file (--config) or command-line flags.
If both are provided, command-line flags override config file values.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runControlCenter(cmd.Context(), configPath, listen, corsOrigins)
		},
	}

	cmd.Flags().StringVarP(&configPath, "config", "c", "", "Path to control center config file (YAML)")
	cmd.Flags().StringVar(&listen, "listen", "", "Server listen address (overrides config)")
	cmd.Flags().StringVar(&corsOrigins, "cors-origins", "", "CORS allowed origins (overrides config)")

	return cmd
}

func runControlCenter(ctx context.Context, configPath, listen, corsOrigins string) error {
	log := logrus.New()
	log.SetFormatter(&logrus.TextFormatter{
		FullTimestamp: true,
	})

	var cfg *controlcenter.Config
	var err error

	if configPath != "" {
		cfg, err = controlcenter.LoadConfig(configPath)
		if err != nil {
			return fmt.Errorf("failed to load config: %w", err)
		}
	} else {
		// Use default config - require at least one instance via flags or env
		cfg = controlcenter.DefaultConfig()
	}

	// Override with command-line flags if provided
	if listen != "" {
		cfg.Listen = listen
	}
	if corsOrigins != "" {
		cfg.CORSOrigins = corsOrigins
	}

	// Validate final config
	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("invalid configuration: %w", err)
	}

	log.WithFields(logrus.Fields{
		"listen":    cfg.Listen,
		"instances": len(cfg.Instances),
	}).Info("Starting Control Center")

	server := controlcenter.NewServer(log, cfg)
	return server.Start(ctx)
}
