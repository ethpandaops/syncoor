package controlcenter

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/sirupsen/logrus"
)

// Server is the Control Center HTTP server
type Server struct {
	log        logrus.FieldLogger
	cfg        *Config
	httpServer *http.Server
	router     *http.ServeMux
	aggregator *Aggregator

	shutdownOnce sync.Once
}

// NewServer creates a new Control Center server
func NewServer(log logrus.FieldLogger, cfg *Config) *Server {
	client := NewClient(log)
	cache := NewCache(log, client, cfg)
	aggregator := NewAggregator(log, cfg, cache)

	s := &Server{
		log:        log,
		cfg:        cfg,
		router:     http.NewServeMux(),
		aggregator: aggregator,
	}

	s.httpServer = &http.Server{
		Addr:    cfg.Listen,
		Handler: s.router,
	}

	s.setupRoutes()

	return s
}

// Start starts the Control Center server
func (s *Server) Start(ctx context.Context) error {
	// Start aggregator (which starts cache)
	if err := s.aggregator.Start(ctx); err != nil {
		return fmt.Errorf("failed to start aggregator: %w", err)
	}

	s.log.WithFields(logrus.Fields{
		"addr":      s.cfg.Listen,
		"instances": len(s.cfg.Instances),
	}).Info("Starting Control Center server")

	// Setup graceful shutdown
	shutdownCh := make(chan os.Signal, 1)
	signal.Notify(shutdownCh, os.Interrupt, syscall.SIGTERM)

	// Start server in goroutine
	serverErrCh := make(chan error, 1)
	go func() {
		s.log.WithField("addr", s.httpServer.Addr).Info("HTTP server listening")
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErrCh <- err
		}
	}()

	// Wait for shutdown signal or server error
	select {
	case err := <-serverErrCh:
		return fmt.Errorf("server error: %w", err)
	case <-shutdownCh:
		s.log.Info("Received shutdown signal")
	case <-ctx.Done():
		s.log.Info("Context cancelled")
	}

	return s.Stop(ctx)
}

// Stop stops the Control Center server
func (s *Server) Stop(ctx context.Context) error {
	var err error
	s.shutdownOnce.Do(func() {
		s.log.Info("Shutting down Control Center server")

		// Create shutdown context with timeout
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Shutdown HTTP server
		if shutdownErr := s.httpServer.Shutdown(shutdownCtx); shutdownErr != nil {
			err = fmt.Errorf("failed to shutdown HTTP server: %w", shutdownErr)
		}

		// Stop aggregator
		s.aggregator.Stop()

		s.log.Info("Control Center server stopped")
	})

	return err
}

// setupRoutes configures the HTTP routes
func (s *Server) setupRoutes() {
	// Control Center API endpoints
	s.router.HandleFunc("/api/v1/cc/status", s.corsMiddleware(s.handleStatus))
	s.router.HandleFunc("/api/v1/cc/instances", s.corsMiddleware(s.handleInstances))
	s.router.HandleFunc("/api/v1/cc/tests", s.corsMiddleware(s.handleTests))
	s.router.HandleFunc("/api/v1/cc/tests/", s.corsMiddleware(s.handleTestDetail))

	// Health and metrics
	s.router.HandleFunc("/health", s.corsMiddleware(s.handleHealth))
	s.router.Handle("/metrics", promhttp.Handler())
}

// corsMiddleware adds CORS headers to responses
func (s *Server) corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origins := s.cfg.CORSOrigins
		if origins == "" {
			origins = "*"
		}

		w.Header().Set("Access-Control-Allow-Origin", origins)
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// Response is the standard API response wrapper
type Response struct {
	Data  interface{} `json:"data,omitempty"`
	Error *ErrorInfo  `json:"error,omitempty"`
}

// ErrorInfo contains error details
type ErrorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// writeJSON writes a JSON response
func (s *Server) writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(v); err != nil {
		s.log.WithError(err).Error("Failed to encode JSON response")
	}
}

// writeError writes an error response
func (s *Server) writeError(w http.ResponseWriter, err error, status int) {
	s.log.WithError(err).Error("Request error")

	response := Response{
		Error: &ErrorInfo{
			Code:    http.StatusText(status),
			Message: err.Error(),
		},
	}

	s.writeJSON(w, status, response)
}
