package api

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
	"github.com/r3labs/sse/v2"
	"github.com/sirupsen/logrus"
)

type Server struct {
	log         logrus.FieldLogger
	httpServer  *http.Server
	router      *http.ServeMux
	sseServer   *sse.Server
	store       *Store
	authToken   string
	mockMode    bool
	corsOrigins string

	shutdownOnce sync.Once
}

func NewServer(log logrus.FieldLogger, addr string, authToken string) *Server {
	store := NewStore(log)

	s := &Server{
		log:         log,
		store:       store,
		authToken:   authToken,
		router:      http.NewServeMux(),
		sseServer:   sse.New(),
		corsOrigins: "*",
	}

	s.httpServer = &http.Server{
		Addr:    addr,
		Handler: s.router,
	}

	s.setupRoutes()
	s.setupSSE()
	s.setupMetrics()

	return s
}

func (s *Server) Start(ctx context.Context) error {
	s.store.Start()

	s.log.WithFields(map[string]interface{}{
		"addr":              s.httpServer.Addr,
		"auth_enabled":      s.authToken != "",
		"store_max_age":     "24h",
		"store_max_history": 1000,
	}).Info("Starting syncoor server")

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

func (s *Server) Stop(ctx context.Context) error {
	var err error
	s.shutdownOnce.Do(func() {
		s.log.Info("Shutting down server")

		// Create shutdown context with timeout
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Shutdown HTTP server
		if shutdownErr := s.httpServer.Shutdown(shutdownCtx); shutdownErr != nil {
			err = fmt.Errorf("failed to shutdown HTTP server: %w", shutdownErr)
		}

		// Stop store
		s.store.Stop()

		// Close SSE server
		s.sseServer.Close()

		s.log.Info("Server stopped")
	})

	return err
}

// EnableMockMode enables mock mode and generates test data
func (s *Server) EnableMockMode() {
	s.mockMode = true
	s.generateMockData()
}

// SetCORSOrigins sets the allowed CORS origins
func (s *Server) SetCORSOrigins(origins string) {
	s.corsOrigins = origins
}

// Setup methods
func (s *Server) setupRoutes() {
	// Client endpoints (require auth)
	s.router.HandleFunc("/api/v1/tests/keepalive", s.corsMiddleware(s.authMiddleware(s.handleTestKeepalive)))
	s.router.HandleFunc("/api/v1/tests/", s.corsMiddleware(s.authMiddleware(s.handleTestOperations)))

	// Public endpoints (no auth)
	s.router.HandleFunc("/api/v1/tests", s.corsMiddleware(s.handleTestList))
	s.router.Handle("/api/v1/events", s.corsHandlerWrapper(s.sseServer))
	s.router.HandleFunc("/health", s.corsMiddleware(s.handleHealth))
}

func (s *Server) setupSSE() {
	s.sseServer.CreateStream("tests")
}

func (s *Server) setupMetrics() {
	s.router.Handle("/metrics", promhttp.Handler())
}

// Helper methods
func (s *Server) writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(v); err != nil {
		s.log.WithError(err).Error("Failed to encode JSON response")
	}
}

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
