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

	"github.com/ethpandaops/syncoor/pkg/reporting"
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
	store := NewStore()

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

// generateMockData creates sample test data for demonstration
func (s *Server) generateMockData() {
	s.log.Info("Generating mock test data")

	// Create more sample test entries with emphasis on running tests
	mockTests := []struct {
		runID   string
		network string
		elType  string
		clType  string
		status  string
	}{
		// Running tests (more of these for better demo)
		{"mock-test-001", "mainnet", "geth", "lighthouse", "running"},
		{"mock-test-002", "mainnet", "besu", "prysm", "running"},
		{"mock-test-003", "sepolia", "nethermind", "teku", "running"},
		{"mock-test-004", "holesky", "reth", "nimbus", "running"},
		{"mock-test-005", "mainnet", "erigon", "lighthouse", "running"},
		{"mock-test-006", "sepolia", "geth", "prysm", "running"},
		{"mock-test-007", "holesky", "besu", "teku", "running"},
		{"mock-test-008", "mainnet", "nethermind", "nimbus", "running"},
		{"mock-test-009", "sepolia", "reth", "lighthouse", "running"},
		{"mock-test-010", "holesky", "erigon", "prysm", "running"},

		// Some completed tests for variety
		{"mock-test-011", "mainnet", "geth", "teku", "completed"},
		{"mock-test-012", "sepolia", "besu", "nimbus", "completed"},
		{"mock-test-013", "holesky", "nethermind", "lighthouse", "completed"},
		{"mock-test-014", "mainnet", "reth", "prysm", "completed"},
		{"mock-test-015", "sepolia", "erigon", "teku", "completed"},
	}

	for _, test := range mockTests {
		s.createMockTest(test.runID, test.network, test.elType, test.clType, test.status)
	}
}

// createMockTest creates a single mock test entry
func (s *Server) createMockTest(runID, network, elType, clType, status string) {
	s.log.WithFields(map[string]interface{}{
		"run_id":  runID,
		"network": network,
		"el":      elType,
		"cl":      clType,
		"status":  status,
	}).Info("Creating mock test")

	// Create the test start request using proper types
	testStartReq := reporting.TestStartRequest{
		RunID:     runID,
		Timestamp: time.Now().Unix(),
		Network:   network,
		Labels:    map[string]string{"mock": "true"},
		ELClient: reporting.ClientConfig{
			Type:  elType,
			Image: elType + ":latest",
		},
		CLClient: reporting.ClientConfig{
			Type:  clType,
			Image: clType + ":latest",
		},
		EnclaveName: "mock-enclave",
	}

	// Create the test in the store
	if err := s.store.CreateTest(testStartReq); err != nil {
		s.log.WithFields(map[string]interface{}{
			"run_id": runID,
			"error":  err.Error(),
		}).Error("Failed to create mock test")
		return
	}

	// Add some mock progress data if the test is running
	if status == "running" {
		mockMetrics := reporting.ProgressMetrics{
			Block:           19500000 + uint64(time.Now().Unix()%1000),
			Slot:            62400000 + uint64(time.Now().Unix()%1000),
			ExecDiskUsage:   450 * 1024 * 1024 * 1024, // 450GB
			ConsDiskUsage:   120 * 1024 * 1024 * 1024, // 120GB
			ExecPeers:       25,
			ConsPeers:       50,
			ExecSyncPercent: 85.5,
			ConsSyncPercent: 92.3,
			ExecVersion:     elType + "/v1.0.0",
			ConsVersion:     clType + "/v2.1.0",
		}

		if err := s.store.UpdateProgress(runID, mockMetrics); err != nil {
			s.log.WithFields(map[string]interface{}{
				"run_id": runID,
				"error":  err.Error(),
			}).Error("Failed to add mock progress")
		}
	} else if status == "completed" {
		// Add some progress history for completed tests
		for i := 0; i < 3; i++ {
			mockMetrics := reporting.ProgressMetrics{
				Block:           19500000 + uint64(i*1000),
				Slot:            62400000 + uint64(i*1000),
				ExecDiskUsage:   (400 + uint64(i*10)) * 1024 * 1024 * 1024,
				ConsDiskUsage:   (100 + uint64(i*5)) * 1024 * 1024 * 1024,
				ExecPeers:       25 + uint64(i),
				ConsPeers:       50 + uint64(i),
				ExecSyncPercent: float64(60 + i*15),
				ConsSyncPercent: float64(70 + i*10),
				ExecVersion:     elType + "/v1.0.0",
				ConsVersion:     clType + "/v2.1.0",
			}

			if err := s.store.UpdateProgress(runID, mockMetrics); err != nil {
				s.log.WithFields(map[string]interface{}{
					"run_id": runID,
					"error":  err.Error(),
				}).Error("Failed to add mock progress")
			}

			// Sleep briefly to create realistic timestamps
			time.Sleep(time.Millisecond * 10)
		}

		// Complete the test
		completeReq := reporting.TestCompleteRequest{
			Timestamp:  time.Now().Unix(),
			FinalBlock: 19503000,
			FinalSlot:  62403000,
			Success:    true,
		}

		if err := s.store.CompleteTest(runID, completeReq); err != nil {
			s.log.WithFields(map[string]interface{}{
				"run_id": runID,
				"error":  err.Error(),
			}).Error("Failed to complete mock test")
		}
	}
}

// Setup methods
func (s *Server) setupRoutes() {
	// Client endpoints (require auth)
	s.router.HandleFunc("/api/v1/tests/start", s.corsMiddleware(s.authMiddleware(s.handleTestStart)))
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
