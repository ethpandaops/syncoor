package api

import (
	"fmt"
	"sync"
	"time"

	"github.com/ethpandaops/syncoor/pkg/reporting"
	"github.com/ethpandaops/syncoor/pkg/sysinfo"
)

type Store struct {
	mu    sync.RWMutex
	tests map[string]*TestData

	// Cleanup configuration
	maxAge      time.Duration
	maxHistory  int // Max progress points per test
	cleanupTick *time.Ticker
	stopCh      chan struct{}
}

type TestData struct {
	RunID      string
	Network    string
	Labels     map[string]string
	StartTime  time.Time
	LastUpdate time.Time
	EndTime    *time.Time
	IsRunning  bool
	IsComplete bool
	Error      string

	ELClient    reporting.ClientConfig
	CLClient    reporting.ClientConfig
	EnclaveName string
	SystemInfo  *sysinfo.SystemInfo

	CurrentMetrics *reporting.ProgressMetrics
	History        []ProgressPoint
}

func NewStore() *Store {
	return &Store{
		tests:      make(map[string]*TestData),
		maxAge:     24 * time.Hour,
		maxHistory: 1000,
		stopCh:     make(chan struct{}),
	}
}

func (s *Store) Start() {
	s.cleanupTick = time.NewTicker(time.Hour)
	go s.cleanupLoop()
}

func (s *Store) Stop() {
	if s.cleanupTick != nil {
		s.cleanupTick.Stop()
	}
	close(s.stopCh)
}

// Write operations
func (s *Store) CreateTest(req reporting.TestStartRequest) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.tests[req.RunID]; exists {
		return fmt.Errorf("test with run_id %s already exists", req.RunID)
	}

	s.tests[req.RunID] = &TestData{
		RunID:       req.RunID,
		Network:     req.Network,
		Labels:      req.Labels,
		StartTime:   time.Unix(req.Timestamp, 0),
		LastUpdate:  time.Unix(req.Timestamp, 0),
		IsRunning:   true,
		IsComplete:  false,
		ELClient:    req.ELClient,
		CLClient:    req.CLClient,
		EnclaveName: req.EnclaveName,
		SystemInfo:  req.SystemInfo,
		History:     make([]ProgressPoint, 0),
	}

	return nil
}

func (s *Store) UpdateProgress(runID string, metrics reporting.ProgressMetrics) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	test, exists := s.tests[runID]
	if !exists {
		return fmt.Errorf("test with run_id %s not found", runID)
	}

	if test.IsComplete {
		return fmt.Errorf("test with run_id %s is already complete", runID)
	}

	now := time.Now()
	test.LastUpdate = now
	test.CurrentMetrics = &metrics

	// Add to history
	test.History = append(test.History, ProgressPoint{
		Timestamp: now,
		Metrics:   metrics,
	})

	// Trim history if needed
	s.trimHistory(test)

	return nil
}

func (s *Store) CompleteTest(runID string, req reporting.TestCompleteRequest) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	test, exists := s.tests[runID]
	if !exists {
		return fmt.Errorf("test with run_id %s not found", runID)
	}

	endTime := time.Unix(req.Timestamp, 0)
	test.EndTime = &endTime
	test.LastUpdate = endTime
	test.IsRunning = false
	test.IsComplete = true
	test.Error = req.Error

	return nil
}

// Read operations
func (s *Store) GetTest(runID string) (*TestData, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	test, exists := s.tests[runID]
	if !exists {
		return nil, fmt.Errorf("test with run_id %s not found", runID)
	}

	// Return a copy to avoid concurrent access issues
	testCopy := *test
	return &testCopy, nil
}

func (s *Store) ListTests(activeOnly bool) []TestSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var tests []TestSummary
	for _, test := range s.tests {
		if activeOnly && !test.IsRunning {
			continue
		}

		summary := TestSummary{
			RunID:          test.RunID,
			Network:        test.Network,
			Labels:         test.Labels,
			StartTime:      test.StartTime,
			LastUpdate:     test.LastUpdate,
			IsRunning:      test.IsRunning,
			IsComplete:     test.IsComplete,
			ELClient:       test.ELClient.Type,
			CLClient:       test.CLClient.Type,
			CurrentMetrics: test.CurrentMetrics,
			SystemInfo:     test.SystemInfo,
		}

		tests = append(tests, summary)
	}

	return tests
}

func (s *Store) GetTestDetail(runID string) (*TestDetail, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	test, exists := s.tests[runID]
	if !exists {
		return nil, fmt.Errorf("test with run_id %s not found", runID)
	}

	detail := &TestDetail{
		TestSummary: TestSummary{
			RunID:          test.RunID,
			Network:        test.Network,
			Labels:         test.Labels,
			StartTime:      test.StartTime,
			LastUpdate:     test.LastUpdate,
			IsRunning:      test.IsRunning,
			IsComplete:     test.IsComplete,
			ELClient:       test.ELClient.Type,
			CLClient:       test.CLClient.Type,
			CurrentMetrics: test.CurrentMetrics,
			SystemInfo:     test.SystemInfo,
		},
		ProgressHistory: make([]ProgressPoint, len(test.History)),
		ELClientConfig:  test.ELClient,
		CLClientConfig:  test.CLClient,
		EnclaveName:     test.EnclaveName,
		EndTime:         test.EndTime,
		Error:           test.Error,
	}

	// Copy history to avoid concurrent modification
	copy(detail.ProgressHistory, test.History)

	return detail, nil
}

// Maintenance
func (s *Store) cleanupLoop() {
	for {
		select {
		case <-s.cleanupTick.C:
			s.cleanup()
		case <-s.stopCh:
			return
		}
	}
}

func (s *Store) cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-s.maxAge)

	for runID, test := range s.tests {
		if test.LastUpdate.Before(cutoff) {
			delete(s.tests, runID)
		}
	}
}

func (s *Store) trimHistory(td *TestData) {
	if len(td.History) > s.maxHistory {
		// Keep the most recent entries
		copy(td.History, td.History[len(td.History)-s.maxHistory:])
		td.History = td.History[:s.maxHistory]
	}
}
