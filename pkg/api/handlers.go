package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

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

	if err := s.store.CreateTest(req); err != nil {
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

	if err := s.store.UpdateProgress(runID, req.Metrics); err != nil {
		s.writeError(w, err, http.StatusInternalServerError)
		return
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

	if err := s.store.CompleteTest(runID, req); err != nil {
		s.writeError(w, err, http.StatusInternalServerError)
		return
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

	health := map[string]interface{}{
		"status":       "healthy",
		"active_tests": len(s.store.ListTests(true)),
		"total_tests":  len(s.store.ListTests(false)),
	}

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
