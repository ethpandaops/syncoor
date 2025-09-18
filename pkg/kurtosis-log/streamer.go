package kurtosislog

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ethpandaops/ethereum-package-go/pkg/client"
	"github.com/kurtosis-tech/kurtosis/api/golang/engine/lib/kurtosis_context"
	"github.com/sirupsen/logrus"
)

var (
	// ErrNilLogChannel is returned when the log channel is nil
	ErrNilLogChannel = errors.New("log channel is nil")
	// ErrLogChannelClosed is returned when the log channel closes unexpectedly
	ErrLogChannelClosed = errors.New("log channel closed unexpectedly")
	// ErrPanicInLogHandler is returned when a panic occurs in the log handler
	ErrPanicInLogHandler = errors.New("panic in log stream handler")
)

// StreamerConfig contains configuration for the log streamer
type StreamerConfig struct {
	// Retry configuration
	MaxRetries     int
	InitialBackoff time.Duration
	MaxBackoff     time.Duration
	BackoffFactor  float64

	// Logging
	Logger logrus.FieldLogger
}

// DefaultConfig returns a default configuration for the log streamer
func DefaultConfig() StreamerConfig {
	return StreamerConfig{
		MaxRetries:     10,
		InitialBackoff: 2 * time.Second,
		MaxBackoff:     30 * time.Second,
		BackoffFactor:  2.0,
		Logger:         logrus.StandardLogger(),
	}
}

// Streamer handles log streaming from Kurtosis services
type Streamer struct {
	config      StreamerConfig
	enclaveName string
	log         logrus.FieldLogger
}

// NewStreamer creates a new log streamer
func NewStreamer(enclaveName string, config StreamerConfig) *Streamer {
	if config.Logger == nil {
		config.Logger = logrus.StandardLogger()
	}

	return &Streamer{
		config:      config,
		enclaveName: enclaveName,
		log:         config.Logger.WithField("component", "kurtosis-log-streamer"),
	}
}

// StreamLogs starts streaming logs from the given client with retry logic
func (s *Streamer) StreamLogs(ctx context.Context, clientName string, clientType string, serviceClient client.ServiceWithLogs) error {
	// Start streaming in a separate goroutine to handle retries
	go s.streamWithRetry(ctx, clientName, clientType, serviceClient)
	return nil
}

// streamWithRetry attempts to stream logs with exponential backoff retry
func (s *Streamer) streamWithRetry(ctx context.Context, clientName string, clientType string, serviceClient client.ServiceWithLogs) {
	backoff := s.config.InitialBackoff

	for attempt := 1; attempt <= s.config.MaxRetries; attempt++ {
		select {
		case <-ctx.Done():
			s.log.WithField("client", clientName).Debug("Context cancelled, stopping log streaming attempts")
			return
		default:
		}

		err := s.startStreaming(ctx, clientName, clientType, serviceClient, attempt)
		if err == nil {
			return // Successfully started
		}

		// Only log warnings after 8 attempts to reduce noise during startup
		if attempt > 8 {
			s.log.WithFields(logrus.Fields{
				"attempt": attempt,
				"error":   err,
				"client":  clientName,
				"type":    clientType,
			}).Warn("Failed to start log streaming, retrying...")
		} else {
			// For initial attempts, just log at debug level
			s.log.WithFields(logrus.Fields{
				"attempt": attempt,
				"client":  clientName,
				"type":    clientType,
			}).Debug("Waiting for logs to become available...")
		}

		if attempt < s.config.MaxRetries {
			select {
			case <-time.After(backoff):
				backoff = time.Duration(float64(backoff) * s.config.BackoffFactor)
				if backoff > s.config.MaxBackoff {
					backoff = s.config.MaxBackoff
				}
			case <-ctx.Done():
				return
			}
		}
	}

	s.log.WithFields(logrus.Fields{
		"client": clientName,
		"type":   clientType,
	}).Error("Failed to start log streaming after all retries")
}

// startStreaming starts the actual log streaming
func (s *Streamer) startStreaming(
	ctx context.Context,
	clientName string,
	clientType string,
	serviceClient client.ServiceWithLogs,
	attempt int,
) error {
	// Create Kurtosis context for log streaming
	kurtosisCtx, err := kurtosis_context.NewKurtosisContextFromLocalEngine()
	if err != nil {
		return fmt.Errorf("failed to create kurtosis context: %w", err)
	}

	logsClient := client.NewLogsClient(kurtosisCtx, s.enclaveName)

	// Start log streaming
	logChan, _ := logsClient.LogsStream(ctx, serviceClient,
		client.WithFollow(true),
	)

	// Check if channel is nil (indicating an error)
	if logChan == nil {
		return fmt.Errorf("failed to start log stream: %w", ErrNilLogChannel)
	}

	// Only log "Started log streaming" after initial attempts to reduce noise
	if attempt > 8 {
		s.log.WithFields(logrus.Fields{
			"client": clientName,
			"type":   clientType,
		}).Info("Started log streaming")
	} else {
		s.log.WithFields(logrus.Fields{
			"client": clientName,
			"type":   clientType,
		}).Debug("Started log streaming")
	}

	// Handle log streaming in a separate goroutine with error reporting
	errorChan := make(chan error, 1)
	go s.handleLogStreamWithErrorReporting(ctx, logChan, clientName, clientType, errorChan)

	// Wait briefly to see if there's an immediate error
	select {
	case err := <-errorChan:
		if err != nil {
			return fmt.Errorf("log stream failed: %w", err)
		}
	case <-time.After(500 * time.Millisecond):
		// No immediate error, stream appears to be working
	case <-ctx.Done():
		return fmt.Errorf("context cancelled: %w", ctx.Err())
	}

	// Continue monitoring for errors in background
	go func() {
		select {
		case err := <-errorChan:
			if err != nil {
				s.log.WithFields(logrus.Fields{
					"client": clientName,
					"type":   clientType,
					"error":  err,
				}).Error("Log stream failed after initial success, will retry on next attempt")
			}
		case <-ctx.Done():
			return
		}
	}()

	return nil
}

// handleLogStreamWithErrorReporting processes logs from the channel and reports errors
func (s *Streamer) handleLogStreamWithErrorReporting(
	ctx context.Context,
	logChan <-chan string,
	clientName string,
	clientType string,
	errorChan chan<- error,
) {
	defer func() {
		if r := recover(); r != nil {
			s.log.WithFields(logrus.Fields{
				"client": clientName,
				"type":   clientType,
				"panic":  r,
			}).Error("Panic in log stream handler")
			errorChan <- fmt.Errorf("%w: %v", ErrPanicInLogHandler, r)
		}
	}()

	for {
		select {
		case log, ok := <-logChan:
			if !ok {
				s.log.WithFields(logrus.Fields{
					"client": clientName,
					"type":   clientType,
				}).Debug("Log channel closed")
				errorChan <- ErrLogChannelClosed
				return
			}

			// Log with enhanced client log formatting for better visibility
			s.logClientMessage(clientType, log)

		case <-ctx.Done():
			s.log.WithFields(logrus.Fields{
				"client": clientName,
				"type":   clientType,
			}).Debug("Context cancelled, stopping log streaming")
			return
		}
	}
}

// logClientMessage formats and logs client messages in a way that's easily distinguishable from app logs
func (s *Streamer) logClientMessage(clientType, message string) {
	// Determine emoji based on client type
	var emoji string
	switch strings.ToLower(clientType) {
	case "geth", "nethermind", "besu", "erigon", "reth", "nimbusel":
		emoji = "🔵" // Execution layer clients
	case "lighthouse", "prysm", "teku", "nimbus", "lodestar", "grandine":
		emoji = "🟣" // Consensus layer clients
	default:
		emoji = "🟡" // Unknown/fallback
	}

	// Create a distinctive prefix for client logs with visual indicators
	clientPrefix := fmt.Sprintf("%s [CLIENT:%-10s]", emoji, clientType)

	// Add visual separators and formatting to make client logs stand out
	formattedMessage := "│ " + strings.TrimSpace(message)

	// Use structured logging with enhanced fields for filtering and identification
	s.config.Logger.Infof("%s %s", clientPrefix, formattedMessage)
}
