package main

import (
	"context"
	"fmt"

	"github.com/ethpandaops/syncoor/pkg/api"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

type ServerConfig struct {
	ListenAddr string
	AuthToken  string
	LogLevel   string
}

func NewServerCommand() *cobra.Command {
	cfg := &ServerConfig{
		ListenAddr: ":8080",
		LogLevel:   "info",
	}

	cmd := &cobra.Command{
		Use:   "server",
		Short: "Run the centralized syncoor server",
		Long:  `Starts an HTTP server that receives sync test progress from distributed sync runners.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runServer(cmd.Context(), cfg)
		},
	}

	// Add flags
	cmd.Flags().StringVar(&cfg.ListenAddr, "listen", ":8080", "Server listen address")
	cmd.Flags().StringVar(&cfg.AuthToken, "auth-token", "", "Bearer token for authentication (optional)")
	cmd.Flags().StringVar(&cfg.LogLevel, "log-level", "info", "Log level (debug, info, warn, error)")

	return cmd
}

func runServer(ctx context.Context, cfg *ServerConfig) error {
	// Setup logging
	log := logrus.New()
	level, err := logrus.ParseLevel(cfg.LogLevel)
	if err != nil {
		return fmt.Errorf("invalid log level: %w", err)
	}
	log.SetLevel(level)

	// Create and start server
	server := api.NewServer(log, cfg.ListenAddr, cfg.AuthToken)

	log.WithField("addr", cfg.ListenAddr).Info("Starting syncoor server")
	if cfg.AuthToken != "" {
		log.Info("Authentication enabled")
	}

	return server.Start(ctx)
}
