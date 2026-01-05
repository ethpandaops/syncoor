package controlcenter

import (
	"context"
	"sort"
	"strings"

	"github.com/sirupsen/logrus"
)

// Aggregator manages data aggregation from multiple Syncoor instances
type Aggregator struct {
	log   logrus.FieldLogger
	cfg   *Config
	cache *Cache
}

// NewAggregator creates a new Aggregator instance
func NewAggregator(log logrus.FieldLogger, cfg *Config, cache *Cache) *Aggregator {
	return &Aggregator{
		log:   log,
		cfg:   cfg,
		cache: cache,
	}
}

// Start initializes the aggregator and starts background processes
func (a *Aggregator) Start(ctx context.Context) error {
	// Add configured instances to cache
	for _, inst := range a.cfg.GetEnabledInstances() {
		a.cache.AddInstance(inst)
	}

	// Start cache refresh
	a.cache.Start(ctx)

	return nil
}

// Stop stops the aggregator and all background processes
func (a *Aggregator) Stop() {
	a.cache.Stop()
}

// GetStatus returns the overall Control Center status
func (a *Aggregator) GetStatus() *ControlCenterStatusResponse {
	health := a.cache.GetInstanceHealth()
	totalTests, activeTests, healthyInstances := a.cache.GetStats()

	return &ControlCenterStatusResponse{
		Instances:        health,
		TotalTests:       totalTests,
		ActiveTests:      activeTests,
		HealthyInstances: healthyInstances,
		LastRefresh:      a.cache.GetLastRefresh(),
	}
}

// GetInstances returns the list of all configured instances with health
func (a *Aggregator) GetInstances() *InstanceListResponse {
	return &InstanceListResponse{
		Instances: a.cache.GetInstanceHealth(),
	}
}

// GetTests returns a filtered, sorted, and paginated list of tests
func (a *Aggregator) GetTests(filters TestListFilters) *AggregatedTestListResponse {
	// Get all tests from cache
	allTests := a.cache.GetAllTests()

	// Apply filters
	filtered := a.filterTests(allTests, filters)

	// Count totals before pagination
	totalCount := len(filtered)
	activeCount := 0
	for _, t := range filtered {
		if t.IsRunning {
			activeCount++
		}
	}

	// Sort
	a.sortTests(filtered, filters.SortBy, filters.SortOrder)

	// Paginate
	page := filters.Page
	if page < 1 {
		page = 1
	}
	pageSize := filters.PageSize
	if pageSize <= 0 {
		pageSize = a.cfg.Pagination.DefaultPageSize
	}
	if pageSize > a.cfg.Pagination.MaxPageSize {
		pageSize = a.cfg.Pagination.MaxPageSize
	}

	totalPages := (totalCount + pageSize - 1) / pageSize
	if totalPages < 1 {
		totalPages = 1
	}

	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(filtered) {
		start = len(filtered)
	}
	if end > len(filtered) {
		end = len(filtered)
	}

	paginated := filtered[start:end]

	// Count unique instances
	instanceSet := make(map[string]struct{})
	for _, t := range allTests {
		instanceSet[t.InstanceName] = struct{}{}
	}

	return &AggregatedTestListResponse{
		Tests:         paginated,
		TotalCount:    totalCount,
		ActiveCount:   activeCount,
		InstanceCount: len(instanceSet),
		Page:          page,
		PageSize:      pageSize,
		TotalPages:    totalPages,
	}
}

// filterTests applies filters to the test list
func (a *Aggregator) filterTests(tests []AggregatedTestSummary, filters TestListFilters) []AggregatedTestSummary {
	var result []AggregatedTestSummary

	for _, t := range tests {
		// Filter by active status
		if filters.Active != nil {
			if *filters.Active && !t.IsRunning {
				continue
			}
			if !*filters.Active && t.IsRunning {
				continue
			}
		}

		// Filter by instance name
		if filters.Instance != "" && !strings.EqualFold(t.InstanceName, filters.Instance) {
			continue
		}

		// Filter by network
		if filters.Network != "" && !strings.EqualFold(t.Network, filters.Network) {
			continue
		}

		// Filter by EL client
		if filters.ELClient != "" && !strings.EqualFold(t.ELClient, filters.ELClient) {
			continue
		}

		// Filter by CL client
		if filters.CLClient != "" && !strings.EqualFold(t.CLClient, filters.CLClient) {
			continue
		}

		result = append(result, t)
	}

	return result
}

// sortTests sorts tests by the specified field and order
func (a *Aggregator) sortTests(tests []AggregatedTestSummary, sortBy, sortOrder string) {
	if sortBy == "" {
		sortBy = "start_time"
	}
	if sortOrder == "" {
		sortOrder = "desc"
	}

	desc := sortOrder == "desc"

	sort.Slice(tests, func(i, j int) bool {
		var less bool

		switch sortBy {
		case "start_time":
			less = tests[i].StartTime.Before(tests[j].StartTime)
		case "last_update":
			less = tests[i].LastUpdate.Before(tests[j].LastUpdate)
		case "instance_name":
			less = strings.ToLower(tests[i].InstanceName) < strings.ToLower(tests[j].InstanceName)
		case "network":
			less = strings.ToLower(tests[i].Network) < strings.ToLower(tests[j].Network)
		case "el_client":
			less = strings.ToLower(tests[i].ELClient) < strings.ToLower(tests[j].ELClient)
		case "cl_client":
			less = strings.ToLower(tests[i].CLClient) < strings.ToLower(tests[j].CLClient)
		default:
			less = tests[i].StartTime.Before(tests[j].StartTime)
		}

		if desc {
			return !less
		}
		return less
	})
}

// GetHealth returns a health response for the CC server
func (a *Aggregator) GetHealth() *HealthResponse {
	totalTests, activeTests, healthyInstances := a.cache.GetStats()
	instanceCount := len(a.cache.GetInstanceNames())

	status := "healthy"
	if healthyInstances == 0 && instanceCount > 0 {
		status = "degraded"
	}

	return &HealthResponse{
		Status:           status,
		InstanceCount:    instanceCount,
		HealthyInstances: healthyInstances,
		TotalTests:       totalTests,
		ActiveTests:      activeTests,
	}
}
