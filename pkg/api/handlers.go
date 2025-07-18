package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ethpandaops/syncoor/pkg/reporting"
)

// Client endpoints (authenticated)
func (s *Server) handleTestStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, fmt.Errorf("method not allowed"), http.StatusMethodNotAllowed)
		return
	}

	var req reporting.TestStartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeError(w, fmt.Errorf("invalid request body: %w", err), http.StatusBadRequest)
		return
	}

	if req.RunID == "" {
		s.writeError(w, fmt.Errorf("run_id is required"), http.StatusBadRequest)
		return
	}

	s.log.WithFields(map[string]interface{}{
		"run_id":    req.RunID,
		"network":   req.Network,
		"el_client": req.ELClient.Type,
		"cl_client": req.CLClient.Type,
		"enclave":   req.EnclaveName,
		"labels":    req.Labels,
	}).Info("Test started")

	if err := s.store.CreateTest(req); err != nil {
		s.log.WithFields(map[string]interface{}{
			"run_id": req.RunID,
			"error":  err.Error(),
		}).Error("Failed to create test")
		s.writeError(w, err, http.StatusInternalServerError)
		return
	}

	// Publish SSE event
	if test, err := s.store.GetTest(req.RunID); err == nil {
		s.publishTestStart(req.RunID, test)
	}

	s.writeJSON(w, http.StatusCreated, Response{Data: map[string]string{"status": "created"}})
}

func (s *Server) handleTestOperations(w http.ResponseWriter, r *http.Request) {
	runID := getRunID(r)
	if runID == "" {
		s.writeError(w, fmt.Errorf("run_id is required"), http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodPost:
		if strings.HasSuffix(r.URL.Path, "/progress") {
			s.handleTestProgress(w, r, runID)
		} else if strings.HasSuffix(r.URL.Path, "/complete") {
			s.handleTestComplete(w, r, runID)
		} else {
			s.writeError(w, fmt.Errorf("invalid endpoint"), http.StatusNotFound)
		}
	case http.MethodGet:
		s.handleTestDetail(w, r, runID)
	default:
		s.writeError(w, fmt.Errorf("method not allowed"), http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleTestProgress(w http.ResponseWriter, r *http.Request, runID string) {
	var req reporting.ProgressUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeError(w, fmt.Errorf("invalid request body: %w", err), http.StatusBadRequest)
		return
	}

	s.log.WithFields(map[string]interface{}{
		"run_id":            runID,
		"block":             req.Metrics.Block,
		"slot":              req.Metrics.Slot,
		"exec_sync_percent": req.Metrics.ExecSyncPercent,
		"cons_sync_percent": req.Metrics.ConsSyncPercent,
		"exec_peers":        req.Metrics.ExecPeers,
		"cons_peers":        req.Metrics.ConsPeers,
		"exec_disk_gb":      req.Metrics.ExecDiskUsage / (1024 * 1024 * 1024),
		"cons_disk_gb":      req.Metrics.ConsDiskUsage / (1024 * 1024 * 1024),
	}).Info("Test progress update")

	if err := s.store.UpdateProgress(runID, req.Metrics); err != nil {
		// If test not found, try to auto-create it
		if strings.Contains(err.Error(), "not found") {
			s.log.WithField("run_id", runID).Info("Auto-creating test from progress update")

			// Create a minimal test entry from the runID
			autoStartReq := s.createTestFromRunID(runID)
			if createErr := s.store.CreateTest(autoStartReq); createErr != nil {
				s.log.WithFields(map[string]interface{}{
					"run_id": runID,
					"error":  createErr.Error(),
				}).Error("Failed to auto-create test")
				s.writeError(w, fmt.Errorf("failed to auto-create test: %w", createErr), http.StatusInternalServerError)
				return
			}

			s.log.WithFields(map[string]interface{}{
				"run_id":    runID,
				"network":   autoStartReq.Network,
				"el_client": autoStartReq.ELClient.Type,
				"cl_client": autoStartReq.CLClient.Type,
			}).Info("Auto-created test from progress update")

			// Publish test start event
			if test, getErr := s.store.GetTest(runID); getErr == nil {
				s.publishTestStart(runID, test)
			}

			// Retry the progress update
			if retryErr := s.store.UpdateProgress(runID, req.Metrics); retryErr != nil {
				s.log.WithFields(map[string]interface{}{
					"run_id": runID,
					"error":  retryErr.Error(),
				}).Error("Failed to update progress after auto-create")
				s.writeError(w, retryErr, http.StatusInternalServerError)
				return
			}
		} else {
			s.log.WithFields(map[string]interface{}{
				"run_id": runID,
				"error":  err.Error(),
			}).Error("Failed to update test progress")
			s.writeError(w, err, http.StatusInternalServerError)
			return
		}
	}

	// Publish SSE event
	s.publishTestProgress(runID, &req.Metrics)

	s.writeJSON(w, http.StatusOK, Response{Data: map[string]string{"status": "updated"}})
}

func (s *Server) handleTestComplete(w http.ResponseWriter, r *http.Request, runID string) {
	var req reporting.TestCompleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeError(w, fmt.Errorf("invalid request body: %w", err), http.StatusBadRequest)
		return
	}

	logFields := map[string]interface{}{
		"run_id":      runID,
		"success":     req.Success,
		"final_block": req.FinalBlock,
		"final_slot":  req.FinalSlot,
	}
	if req.Error != "" {
		logFields["error"] = req.Error
	}
	s.log.WithFields(logFields).Info("Test completed")

	if err := s.store.CompleteTest(runID, req); err != nil {
		// If test not found, try to auto-create it
		if strings.Contains(err.Error(), "not found") {
			s.log.WithField("run_id", runID).Info("Auto-creating test from completion request")

			// Create a minimal test entry from the runID
			autoStartReq := s.createTestFromRunID(runID)
			if createErr := s.store.CreateTest(autoStartReq); createErr != nil {
				s.log.WithFields(map[string]interface{}{
					"run_id": runID,
					"error":  createErr.Error(),
				}).Error("Failed to auto-create test")
				s.writeError(w, fmt.Errorf("failed to auto-create test: %w", createErr), http.StatusInternalServerError)
				return
			}

			s.log.WithFields(map[string]interface{}{
				"run_id":    runID,
				"network":   autoStartReq.Network,
				"el_client": autoStartReq.ELClient.Type,
				"cl_client": autoStartReq.CLClient.Type,
			}).Info("Auto-created test from completion request")

			// Publish test start event
			if test, getErr := s.store.GetTest(runID); getErr == nil {
				s.publishTestStart(runID, test)
			}

			// Retry the completion
			if retryErr := s.store.CompleteTest(runID, req); retryErr != nil {
				s.log.WithFields(map[string]interface{}{
					"run_id": runID,
					"error":  retryErr.Error(),
				}).Error("Failed to complete test after auto-create")
				s.writeError(w, retryErr, http.StatusInternalServerError)
				return
			}
		} else {
			s.log.WithFields(map[string]interface{}{
				"run_id": runID,
				"error":  err.Error(),
			}).Error("Failed to complete test")
			s.writeError(w, err, http.StatusInternalServerError)
			return
		}
	}

	// Publish SSE event
	s.publishTestComplete(runID, req.Success, req.Error)

	s.writeJSON(w, http.StatusOK, Response{Data: map[string]string{"status": "completed"}})
}

// Public endpoints
func (s *Server) handleTestList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, fmt.Errorf("method not allowed"), http.StatusMethodNotAllowed)
		return
	}

	// Check for activeOnly query parameter
	activeOnly := r.URL.Query().Get("active") == "true"

	tests := s.store.ListTests(activeOnly)

	response := TestListResponse{
		Tests:       tests,
		TotalCount:  len(tests),
		ActiveCount: s.countActiveTests(tests),
	}

	s.writeJSON(w, http.StatusOK, Response{Data: response})
}

func (s *Server) handleTestDetail(w http.ResponseWriter, r *http.Request, runID string) {
	detail, err := s.store.GetTestDetail(runID)
	if err != nil {
		s.writeError(w, err, http.StatusNotFound)
		return
	}

	s.writeJSON(w, http.StatusOK, Response{Data: detail})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, fmt.Errorf("method not allowed"), http.StatusMethodNotAllowed)
		return
	}

	activeCnt := len(s.store.ListTests(true))
	totalCnt := len(s.store.ListTests(false))

	health := map[string]interface{}{
		"status":       "healthy",
		"active_tests": activeCnt,
		"total_tests":  totalCnt,
	}

	s.log.WithFields(map[string]interface{}{
		"active_tests": activeCnt,
		"total_tests":  totalCnt,
		"remote_addr":  r.RemoteAddr,
	}).Debug("Health check requested")

	s.writeJSON(w, http.StatusOK, Response{Data: health})
}

// Helper to extract runId from URL
func getRunID(r *http.Request) string {
	// Extract run ID from URL path like /api/v1/tests/{runId}/progress
	parts := strings.Split(r.URL.Path, "/")
	for i, part := range parts {
		if part == "tests" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

func (s *Server) countActiveTests(tests []TestSummary) int {
	count := 0
	for _, test := range tests {
		if test.IsRunning {
			count++
		}
	}
	return count
}

// createTestFromRunID creates a minimal test entry from a run ID
// This is used when the server restarts but clients continue sending progress
func (s *Server) createTestFromRunID(runID string) reporting.TestStartRequest {
	// Extract information from runID format: sync-test-timestamp-network_el_cl
	parts := strings.Split(runID, "-")

	network := "unknown"
	elClient := "unknown"
	clClient := "unknown"

	if len(parts) >= 4 {
		// Last part should be network_el_cl
		lastPart := parts[len(parts)-1]
		clientParts := strings.Split(lastPart, "_")
		if len(clientParts) >= 3 {
			network = clientParts[0]
			elClient = clientParts[1]
			clClient = clientParts[2]
		}
	}

	return reporting.TestStartRequest{
		RunID:     runID,
		Timestamp: time.Now().Unix(),
		Network:   network,
		Labels: map[string]string{
			"auto_created": "true",
			"reason":       "server_restart",
		},
		ELClient: reporting.ClientConfig{
			Type:  elClient,
			Image: "",
		},
		CLClient: reporting.ClientConfig{
			Type:  clClient,
			Image: "",
		},
		EnclaveName: "auto-created",
	}
}
