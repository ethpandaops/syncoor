package api

import (
	"crypto/rand"
	"math/big"
	"strconv"
	"time"

	"github.com/ethpandaops/syncoor/pkg/reporting"
)

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

	testKeepAliveReq := s.buildMockTestRequest(runID, network, elType, clType)

	// Create the test in the store
	if err := s.store.CreateTest(testKeepAliveReq); err != nil {
		s.log.WithFields(map[string]interface{}{
			"run_id": runID,
			"error":  err.Error(),
		}).Error("Failed to create mock test")
		return
	}

	switch status {
	case "running":
		s.addRunningTestData(runID, elType, clType)
	case "completed":
		s.addCompletedTestData(runID, elType, clType)
	}
}

// buildMockTestRequest builds the test keepalive request with GitHub labels
func (s *Server) buildMockTestRequest(runID, network, elType, clType string) reporting.TestKeepaliveRequest {
	labels := map[string]string{
		"mock":              "true",
		"github.run_id":     generateRandomRunID(),
		"github.run_number": generateRandomRunNumber(),
		"github.job":        "sync",
		"github.job_id":     generateRandomJobID(),
		"github.repository": "ethpandaops/syncoor",
		"github.workflow":   "Sync Test",
		"github.sha":        generateRandomSHA(),
		"github.actor":      generateRandomActor(),
		"github.event_name": "workflow_dispatch",
		"github.ref":        "refs/heads/main",
	}

	return reporting.TestKeepaliveRequest{
		RunID:     runID,
		Timestamp: time.Now().Unix(),
		Network:   network,
		Labels:    labels,
		ELClient: reporting.ClientConfig{
			Type:  elType,
			Image: elType + ":latest",
		},
		CLClient: reporting.ClientConfig{
			Type:  clType,
			Image: clType + ":latest",
		},
		EnclaveName: "mock-enclave",
		SystemInfo:  nil,
	}
}

// addRunningTestData adds mock progress data for running tests
func (s *Server) addRunningTestData(runID, elType, clType string) {
	now := time.Now().Unix()
	var timeOffset uint64
	if now > 0 {
		timeOffset = uint64(now) % 1000
	}

	mockMetrics := reporting.ProgressMetrics{
		Block:           19500000 + timeOffset,
		Slot:            62400000 + timeOffset,
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
}

// addCompletedTestData adds mock progress history and completes the test
func (s *Server) addCompletedTestData(runID, elType, clType string) {
	// Add some progress history for completed tests
	for i := range 3 {
		var iOffset uint64
		if i >= 0 {
			iOffset = uint64(i)
		}
		mockMetrics := reporting.ProgressMetrics{
			Block:           19500000 + iOffset*1000,
			Slot:            62400000 + iOffset*1000,
			ExecDiskUsage:   (400 + iOffset*10) * 1024 * 1024 * 1024,
			ConsDiskUsage:   (100 + iOffset*5) * 1024 * 1024 * 1024,
			ExecPeers:       25 + iOffset,
			ConsPeers:       50 + iOffset,
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

// Helper functions for generating GitHub-related mock data
func generateRandomRunID() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(9000000000))
	return strconv.FormatInt(n.Int64()+1000000000, 10)
}

func generateRandomRunNumber() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(4999))
	return strconv.FormatInt(n.Int64()+1, 10)
}

func generateRandomJobID() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(90000000000))
	return strconv.FormatInt(n.Int64()+10000000000, 10)
}

func generateRandomSHA() string {
	const chars = "abcdef0123456789"
	result := make([]byte, 40)
	for i := range result {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		result[i] = chars[n.Int64()]
	}
	return string(result)
}

func generateRandomActor() string {
	actors := []string{"alice-dev", "bob-tester", "charlie-ops", "diana-ci", "evan-qa"}
	n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(actors))))
	return actors[n.Int64()]
}
