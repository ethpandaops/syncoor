package controlcenter

import (
	"time"

	"github.com/ethpandaops/syncoor/pkg/api"
)

// InstanceHealth represents the health status of a remote Syncoor instance
type InstanceHealth struct {
	Name         string          `json:"name"`
	APIUrl       string          `json:"api_url"`
	UIUrl        string          `json:"ui_url"`
	Status       string          `json:"status"` // "healthy", "unhealthy", "unknown"
	ActiveTests  int             `json:"active_tests"`
	TotalTests   int             `json:"total_tests"`
	LastCheck    time.Time       `json:"last_check"`
	LastSuccess  time.Time       `json:"last_success,omitempty"`
	ErrorMessage string          `json:"error_message,omitempty"`
	Directories  []DirectoryInfo `json:"directories,omitempty"`
}

// DirectoryInfo represents aggregated info from a directory's index.json
type DirectoryInfo struct {
	Name         string         `json:"name"`
	DisplayName  string         `json:"display_name"`
	URL          string         `json:"url"`
	Generated    int64          `json:"generated"`
	TotalTests   int            `json:"total_tests"`
	StatusCounts map[string]int `json:"status_counts"`
	FetchError   string         `json:"fetch_error,omitempty"`
	RecentRuns   []RecentRun    `json:"recent_runs,omitempty"`
}

// RecentRun represents a recent test run from a directory index
type RecentRun struct {
	RunID    string `json:"run_id"`
	Status   string `json:"status"`
	ELClient string `json:"el_client"`
	CLClient string `json:"cl_client"`
	Time     int64  `json:"time"`
}

// DirectoryIndex represents the structure of index.json from a directory
type DirectoryIndex struct {
	Generated int64                 `json:"generated"`
	Entries   []DirectoryIndexEntry `json:"entries"`
}

// DirectoryIndexEntry represents a single entry in index.json
type DirectoryIndexEntry struct {
	RunID               string              `json:"run_id"`
	Timestamp           int64               `json:"timestamp"`
	SyncInfo            DirectorySyncInfo   `json:"sync_info"`
	ExecutionClientInfo DirectoryClientInfo `json:"execution_client_info"`
	ConsensusClientInfo DirectoryClientInfo `json:"consensus_client_info"`
}

// DirectorySyncInfo contains sync status information
type DirectorySyncInfo struct {
	Status string `json:"status"`
}

// DirectoryClientInfo contains client information
type DirectoryClientInfo struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// InstanceStatus constants
const (
	StatusHealthy   = "healthy"
	StatusUnhealthy = "unhealthy"
	StatusUnknown   = "unknown"
)

// AggregatedTestSummary extends TestSummary with instance information
type AggregatedTestSummary struct {
	api.TestSummary
	InstanceName   string `json:"instance_name"`
	InstanceAPIUrl string `json:"instance_api_url"`
	InstanceUIUrl  string `json:"instance_ui_url"`
}

// AggregatedTestListResponse is the Control Center version of test list response
type AggregatedTestListResponse struct {
	Tests         []AggregatedTestSummary `json:"tests"`
	TotalCount    int                     `json:"total_count"`
	ActiveCount   int                     `json:"active_count"`
	InstanceCount int                     `json:"instance_count"`
	Page          int                     `json:"page"`
	PageSize      int                     `json:"page_size"`
	TotalPages    int                     `json:"total_pages"`
}

// InstanceListResponse contains the list of configured instances with health
type InstanceListResponse struct {
	Instances []InstanceHealth `json:"instances"`
}

// ControlCenterStatusResponse provides overall Control Center status
type ControlCenterStatusResponse struct {
	Instances        []InstanceHealth `json:"instances"`
	TotalTests       int              `json:"total_tests"`
	ActiveTests      int              `json:"active_tests"`
	HealthyInstances int              `json:"healthy_instances"`
	LastRefresh      time.Time        `json:"last_refresh"`
	GitHubQueued     int              `json:"github_queued"`
	GitHubRunning    int              `json:"github_running"`
}

// HealthResponse is the health check response for the CC server
type HealthResponse struct {
	Status           string `json:"status"`
	InstanceCount    int    `json:"instance_count"`
	HealthyInstances int    `json:"healthy_instances"`
	TotalTests       int    `json:"total_tests"`
	ActiveTests      int    `json:"active_tests"`
}

// TestListFilters contains the query parameters for filtering tests
type TestListFilters struct {
	Active    *bool
	Instance  string
	Network   string
	ELClient  string
	CLClient  string
	SortBy    string
	SortOrder string
	Page      int
	PageSize  int
}

// DefaultFilters returns default filter values
func DefaultFilters(cfg *Config) TestListFilters {
	return TestListFilters{
		SortBy:    "start_time",
		SortOrder: "desc",
		Page:      1,
		PageSize:  cfg.Pagination.DefaultPageSize,
	}
}

// ValidateSortBy checks if the sort field is valid
func ValidateSortBy(sortBy string) bool {
	validFields := map[string]bool{
		"start_time":    true,
		"last_update":   true,
		"instance_name": true,
		"network":       true,
		"el_client":     true,
		"cl_client":     true,
	}
	return validFields[sortBy]
}

// ValidateSortOrder checks if the sort order is valid
func ValidateSortOrder(order string) bool {
	return order == "asc" || order == "desc"
}

// WorkflowQueueStatus represents queue status for a single GitHub workflow
type WorkflowQueueStatus struct {
	Name         string      `json:"name"`
	Owner        string      `json:"owner"`
	Repo         string      `json:"repo"`
	WorkflowID   string      `json:"workflow_id"`
	WorkflowURL  string      `json:"workflow_url"`
	QueuedCount  int         `json:"queued_count"`
	RunningCount int         `json:"running_count"`
	Jobs         []GitHubJob `json:"jobs"`
	LastCheck    time.Time   `json:"last_check"`
	Error        string      `json:"error,omitempty"`
}

// GitHubJob represents a single GitHub Actions job
type GitHubJob struct {
	ID          int64  `json:"id"`
	RunID       int64  `json:"run_id"`
	Name        string `json:"name"`
	Status      string `json:"status"`    // queued, in_progress, completed, waiting
	Conclusion  string `json:"conclusion"` // success, failure, etc. (only if completed)
	StartedAt   string `json:"started_at,omitempty"`
	CreatedAt   string `json:"created_at"`
	HTMLURL     string `json:"html_url"`
	Branch      string `json:"branch"`
	Actor       string `json:"actor"`
	ActorAvatar string `json:"actor_avatar"`
	RunNumber   int    `json:"run_number"`
}

// GitHubQueueResponse is the API response for queue status
type GitHubQueueResponse struct {
	Workflows        []WorkflowQueueStatus `json:"workflows"`
	TotalQueued      int                   `json:"total_queued"`
	TotalRunning     int                   `json:"total_running"`
	RateLimitRemain  int                   `json:"rate_limit_remaining"`
}
