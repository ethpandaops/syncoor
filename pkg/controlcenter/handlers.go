package controlcenter

import (
	"net/http"
	"strconv"
	"strings"
)

// handleStatus handles GET /api/v1/cc/status
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, http.ErrNotSupported, http.StatusMethodNotAllowed)
		return
	}

	status := s.aggregator.GetStatus()
	s.writeJSON(w, http.StatusOK, Response{Data: status})
}

// handleInstances handles GET /api/v1/cc/instances
func (s *Server) handleInstances(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, http.ErrNotSupported, http.StatusMethodNotAllowed)
		return
	}

	instances := s.aggregator.GetInstances()
	s.writeJSON(w, http.StatusOK, Response{Data: instances})
}

// handleTests handles GET /api/v1/cc/tests
func (s *Server) handleTests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, http.ErrNotSupported, http.StatusMethodNotAllowed)
		return
	}

	// Parse query parameters
	filters := s.parseTestFilters(r)

	tests := s.aggregator.GetTests(filters)
	s.writeJSON(w, http.StatusOK, Response{Data: tests})
}

// handleTestDetail handles GET /api/v1/cc/tests/{runId}
func (s *Server) handleTestDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, http.ErrNotSupported, http.StatusMethodNotAllowed)
		return
	}

	// Extract runId from path
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/cc/tests/")
	runID := strings.TrimSuffix(path, "/")

	if runID == "" {
		s.writeError(w, http.ErrNotSupported, http.StatusBadRequest)
		return
	}

	// Find the test in the cache to determine which instance has it
	allTests := s.aggregator.cache.GetAllTests()
	var foundTest *AggregatedTestSummary
	for _, t := range allTests {
		if t.RunID == runID {
			foundTest = &t
			break
		}
	}

	if foundTest == nil {
		s.writeError(w, http.ErrMissingFile, http.StatusNotFound)
		return
	}

	// Fetch details from the source instance
	detail, err := s.aggregator.cache.client.FetchTestDetail(r.Context(), foundTest.InstanceAPIUrl, runID)
	if err != nil {
		s.writeError(w, err, http.StatusBadGateway)
		return
	}

	// Create a combined response with instance info
	combinedResponse := map[string]interface{}{
		"run_id":           detail.RunID,
		"network":          detail.Network,
		"labels":           detail.Labels,
		"start_time":       detail.StartTime,
		"last_update":      detail.LastUpdate,
		"is_running":       detail.IsRunning,
		"is_complete":      detail.IsComplete,
		"el_client":        detail.ELClient,
		"cl_client":        detail.CLClient,
		"el_client_config": detail.ELClientConfig,
		"cl_client_config": detail.CLClientConfig,
		"current_metrics":  detail.CurrentMetrics,
		"system_info":      detail.SystemInfo,
		"run_timeout":      detail.RunTimeout,
		"progress_history": detail.ProgressHistory,
		"enclave_name":     detail.EnclaveName,
		"end_time":         detail.EndTime,
		"error":            detail.Error,
		"instance_name":    foundTest.InstanceName,
		"instance_api_url": foundTest.InstanceAPIUrl,
		"instance_ui_url":  foundTest.InstanceUIUrl,
	}

	s.writeJSON(w, http.StatusOK, Response{Data: combinedResponse})
}

// handleHealth handles GET /health
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, http.ErrNotSupported, http.StatusMethodNotAllowed)
		return
	}

	health := s.aggregator.GetHealth()
	s.writeJSON(w, http.StatusOK, health)
}

// parseTestFilters parses query parameters into TestListFilters
func (s *Server) parseTestFilters(r *http.Request) TestListFilters {
	q := r.URL.Query()

	filters := DefaultFilters(s.cfg)

	// Parse active filter
	if activeStr := q.Get("active"); activeStr != "" {
		active := activeStr == "true" || activeStr == "1"
		filters.Active = &active
	}

	// Parse instance filter
	if instance := q.Get("instance"); instance != "" {
		filters.Instance = instance
	}

	// Parse network filter
	if network := q.Get("network"); network != "" {
		filters.Network = network
	}

	// Parse EL client filter
	if elClient := q.Get("el_client"); elClient != "" {
		filters.ELClient = elClient
	}

	// Parse CL client filter
	if clClient := q.Get("cl_client"); clClient != "" {
		filters.CLClient = clClient
	}

	// Parse sort_by
	if sortBy := q.Get("sort_by"); sortBy != "" && ValidateSortBy(sortBy) {
		filters.SortBy = sortBy
	}

	// Parse sort_order
	if sortOrder := q.Get("sort_order"); sortOrder != "" && ValidateSortOrder(sortOrder) {
		filters.SortOrder = sortOrder
	}

	// Parse page
	if pageStr := q.Get("page"); pageStr != "" {
		if page, err := strconv.Atoi(pageStr); err == nil && page > 0 {
			filters.Page = page
		}
	}

	// Parse page_size
	if pageSizeStr := q.Get("page_size"); pageSizeStr != "" {
		if pageSize, err := strconv.Atoi(pageSizeStr); err == nil && pageSize > 0 {
			if pageSize > s.cfg.Pagination.MaxPageSize {
				pageSize = s.cfg.Pagination.MaxPageSize
			}
			filters.PageSize = pageSize
		}
	}

	return filters
}
