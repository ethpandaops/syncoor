package api

import (
	"crypto/rand"
	"math/big"
	"strconv"
	"time"

	"github.com/ethpandaops/syncoor/pkg/reporting"
)

// Network constants
const (
	networkMainnet = "mainnet"
	networkHolesky = "holesky"
	networkSepolia = "sepolia"
	networkHoodi   = "hoodi"
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
		{"mock-test-001", networkMainnet, "geth", "lighthouse", "running"},
		{"mock-test-002", networkMainnet, "besu", "prysm", "running"},
		{"mock-test-003", networkSepolia, "nethermind", "teku", "running"},
		{"mock-test-004", networkHolesky, "reth", "nimbus", "running"},
		{"mock-test-005", networkMainnet, "erigon", "lighthouse", "running"},
		{"mock-test-006", networkSepolia, "geth", "prysm", "running"},
		{"mock-test-007", networkHolesky, "besu", "teku", "running"},
		{"mock-test-008", networkMainnet, "nethermind", "nimbus", "running"},
		{"mock-test-009", networkSepolia, "reth", "lighthouse", "running"},
		{"mock-test-010", networkHolesky, "erigon", "prysm", "running"},

		// Some completed tests for variety
		{"mock-test-011", networkMainnet, "geth", "teku", "completed"},
		{"mock-test-012", networkSepolia, "besu", "nimbus", "completed"},
		{"mock-test-013", networkHolesky, "nethermind", "lighthouse", "completed"},
		{"mock-test-014", networkMainnet, "reth", "prysm", "completed"},
		{"mock-test-015", networkSepolia, "erigon", "teku", "completed"},

		// Some timeout tests for variety
		{"mock-test-016", networkMainnet, "geth", "nimbus", "timeout"},
		{"mock-test-017", networkSepolia, "besu", "lighthouse", "timeout"},
		{"mock-test-018", networkHolesky, "nethermind", "prysm", "timeout"},
		{"mock-test-019", networkMainnet, "reth", "teku", "timeout"},
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
	case "timeout":
		s.addTimeoutTestData(runID, elType, clType)
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
			Type:      elType,
			Image:     elType + ":latest",
			ExtraArgs: generateMockExtraArgs(elType, network),
			EnvVars:   generateMockEnvVars(elType, network),
		},
		CLClient: reporting.ClientConfig{
			Type:      clType,
			Image:     clType + ":latest",
			ExtraArgs: generateMockExtraArgs(clType, network),
			EnvVars:   generateMockEnvVars(clType, network),
		},
		EnclaveName: "mock-enclave",
		SystemInfo:  nil,
		RunTimeout:  generateMockTimeout(network),
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

// generateMockProgressHistory generates mock progress entries with configurable parameters
func (s *Server) generateMockProgressHistory(runID, elType, clType string, config mockProgressConfig) {
	for i := range config.entries {
		var iOffset uint64
		if i >= 0 {
			iOffset = uint64(i)
		}
		mockMetrics := reporting.ProgressMetrics{
			Block:           config.baseBlock + iOffset*config.blockStep,
			Slot:            config.baseSlot + iOffset*config.slotStep,
			ExecDiskUsage:   (config.baseDiskExec + iOffset*config.diskStepExec) * 1024 * 1024 * 1024,
			ConsDiskUsage:   (config.baseDiskCons + iOffset*config.diskStepCons) * 1024 * 1024 * 1024,
			ExecPeers:       config.basePeersExec + iOffset,
			ConsPeers:       config.basePeersCons + iOffset,
			ExecSyncPercent: float64(config.baseSyncExec + i*config.syncStepExec),
			ConsSyncPercent: float64(config.baseSyncCons + i*config.syncStepCons),
			ExecVersion:     elType + "/v1.0.0",
			ConsVersion:     clType + "/v2.1.0",
		}

		if err := s.store.UpdateProgress(runID, mockMetrics); err != nil {
			s.log.WithFields(map[string]interface{}{
				"run_id": runID,
				"error":  err.Error(),
			}).Error("Failed to add mock " + config.logContext + " progress")
		}

		// Sleep briefly to create realistic timestamps
		time.Sleep(time.Millisecond * 10)
	}
}

type mockProgressConfig struct {
	entries       int
	baseBlock     uint64
	baseSlot      uint64
	blockStep     uint64
	slotStep      uint64
	baseDiskExec  uint64
	baseDiskCons  uint64
	diskStepExec  uint64
	diskStepCons  uint64
	basePeersExec uint64
	basePeersCons uint64
	baseSyncExec  int
	baseSyncCons  int
	syncStepExec  int
	syncStepCons  int
	logContext    string
}

// addCompletedTestData adds mock progress history and completes the test
func (s *Server) addCompletedTestData(runID, elType, clType string) {
	// Add progress history for completed tests
	config := mockProgressConfig{
		entries:       3,
		baseBlock:     19500000,
		baseSlot:      62400000,
		blockStep:     1000,
		slotStep:      1000,
		baseDiskExec:  400,
		baseDiskCons:  100,
		diskStepExec:  10,
		diskStepCons:  5,
		basePeersExec: 25,
		basePeersCons: 50,
		baseSyncExec:  60,
		baseSyncCons:  70,
		syncStepExec:  15,
		syncStepCons:  10,
		logContext:    "completed",
	}
	s.generateMockProgressHistory(runID, elType, clType, config)

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

// addTimeoutTestData adds mock progress history and marks the test as timed out
func (s *Server) addTimeoutTestData(runID, elType, clType string) {
	// Add progress history for timeout tests (partial sync progress)
	config := mockProgressConfig{
		entries:       2,
		baseBlock:     19400000,
		baseSlot:      62300000,
		blockStep:     500,
		slotStep:      500,
		baseDiskExec:  300,
		baseDiskCons:  80,
		diskStepExec:  20,
		diskStepCons:  10,
		basePeersExec: 15,
		basePeersCons: 30,
		baseSyncExec:  30,
		baseSyncCons:  40,
		syncStepExec:  20,
		syncStepCons:  15,
		logContext:    "timeout",
	}
	s.generateMockProgressHistory(runID, elType, clType, config)

	// Complete the test with timeout status
	timeoutReq := reporting.TestCompleteRequest{
		Timestamp:  time.Now().Unix(),
		FinalBlock: 19401000,                                // Lower final block showing incomplete sync
		FinalSlot:  62301000,                                // Lower final slot showing incomplete sync
		Success:    false,                                   // Mark as failed due to timeout
		Error:      "Sync operation timed out after 2h0m0s", // Mock timeout message
	}

	if err := s.store.CompleteTest(runID, timeoutReq); err != nil {
		s.log.WithFields(map[string]interface{}{
			"run_id": runID,
			"error":  err.Error(),
		}).Error("Failed to complete mock timeout test")
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

// getClientExtraArgs returns argument configurations for different client types
func getClientExtraArgs() map[string]func(network string) []string {
	return map[string]func(network string) []string{
		"geth": func(network string) []string {
			args := []string{"--syncmode=snap", "--cache=4096"}
			if network == networkMainnet {
				args = append(args, "--maxpeers=50")
			}
			return args
		},
		"besu": func(network string) []string {
			args := []string{"--sync-mode=SNAP", "--Xplugin-rocksdb-high-spec-enabled"}
			if network != networkMainnet {
				args = append(args, "--network="+network)
			}
			return args
		},
		"nethermind": func(network string) []string {
			return []string{"--config=" + network, "--Sync.FastSync=true"}
		},
		"erigon": func(network string) []string {
			return []string{"--chain=" + network, "--prune=hrtc"}
		},
		"reth": func(network string) []string {
			return []string{"--chain=" + network, "--debug.continuous"}
		},
		"lighthouse": func(network string) []string {
			args := []string{"--network=" + network}
			if network == networkMainnet {
				args = append(args, "--checkpoint-sync-url=https://mainnet.checkpoint.sigp.io")
			}
			return args
		},
		"prysm": func(network string) []string {
			return []string{"--" + network, "--accept-terms-of-use"}
		},
		"teku": func(network string) []string {
			return []string{"--network=" + network, "--data-storage-mode=prune"}
		},
		"nimbus": func(network string) []string {
			return []string{"--network=" + network, "--web3-url=http://127.0.0.1:8551"}
		},
	}
}

// generateMockExtraArgs generates realistic extra arguments for clients
func generateMockExtraArgs(clientType, network string) []string {
	clientArgs := getClientExtraArgs()
	if argFunc, exists := clientArgs[clientType]; exists {
		return argFunc(network)
	}
	return []string{}
}

// getClientEnvVars returns environment variable configurations for different client types
func getClientEnvVars() map[string]func(network string) map[string]string {
	return map[string]func(network string) map[string]string{
		"geth": func(network string) map[string]string {
			envVars := map[string]string{
				"GETH_CACHE":    "4096",
				"GETH_MAXPEERS": "50",
			}
			if network == networkSepolia {
				envVars["GETH_TESTNET"] = networkSepolia
			}
			return envVars
		},
		"besu": func(_ string) map[string]string {
			return map[string]string{
				"BESU_OPTS":           "-Xmx8g",
				"BESU_RPC_HTTP_APIS":  "ETH,NET,WEB3",
				"BESU_STORAGE_ENGINE": "BONSAI",
			}
		},
		"nethermind": func(_ string) map[string]string {
			return map[string]string{
				"NETHERMIND_PRUNING_CACHESIZERESTART": "2048",
				"NETHERMIND_DISCOVERY_BOOTNODES":      "auto",
				"ASPNETCORE_ENVIRONMENT":              "Production",
			}
		},
		"erigon": func(network string) map[string]string {
			return map[string]string{
				"ERIGON_DATADIR": "/data",
				"ERIGON_CHAIN":   network,
				"GOMAXPROCS":     "8",
			}
		},
		"reth": func(network string) map[string]string {
			return map[string]string{
				"RUST_LOG":     "info",
				"RETH_DATADIR": "/data",
				"RETH_NETWORK": network,
			}
		},
		"lighthouse": func(network string) map[string]string {
			envVars := map[string]string{
				"RUST_LOG":           "info",
				"LIGHTHOUSE_NETWORK": network,
				"LIGHTHOUSE_DATADIR": "/data",
			}
			if network == networkMainnet {
				envVars["LIGHTHOUSE_CHECKPOINT_SYNC"] = "true"
			}
			return envVars
		},
		"prysm": func(_ string) map[string]string {
			return map[string]string{
				"PRYSM_WEB3PROVIDER": "http://127.0.0.1:8551",
				"PRYSM_DATADIR":      "/data",
				"GOMAXPROCS":         "4",
			}
		},
		"teku": func(network string) map[string]string {
			return map[string]string{
				"JAVA_OPTS":      "-Xmx4g -XX:+UseG1GC",
				"TEKU_NETWORK":   network,
				"TEKU_DATA_PATH": "/data",
			}
		},
		"nimbus": func(network string) map[string]string {
			return map[string]string{
				"NIMBUS_NETWORK":  network,
				"NIMBUS_DATA_DIR": "/data",
				"NIMBUS_WEB3_URL": "http://127.0.0.1:8551",
			}
		},
	}
}

// generateMockEnvVars generates realistic environment variables for clients
func generateMockEnvVars(clientType, network string) map[string]string {
	clientEnvs := getClientEnvVars()
	if envFunc, exists := clientEnvs[clientType]; exists {
		return envFunc(network)
	}
	return map[string]string{}
}

// getNetworkTimeouts returns timeout configurations in seconds for different networks
func getNetworkTimeouts() map[string]int64 {
	return map[string]int64{
		networkMainnet: 7200, // 2 hours
		networkHolesky: 3600, // 1 hour
		networkSepolia: 2700, // 45 minutes
		networkHoodi:   1800, // 30 minutes
	}
}

// generateMockTimeout generates realistic timeout values based on network
func generateMockTimeout(network string) int64 {
	timeouts := getNetworkTimeouts()
	if timeout, exists := timeouts[network]; exists {
		return timeout
	}
	return 3600 // Default to 1 hour
}
