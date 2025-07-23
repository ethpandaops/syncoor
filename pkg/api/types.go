package api

import (
	"time"

	"github.com/ethpandaops/syncoor/pkg/reporting"
	"github.com/ethpandaops/syncoor/pkg/sysinfo"
)

// API response types
type Response struct {
	Data  interface{} `json:"data,omitempty"`
	Error *ErrorInfo  `json:"error,omitempty"`
}

type ErrorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type TestSummary struct {
	RunID          string                     `json:"run_id"`
	Network        string                     `json:"network"`
	Labels         map[string]string          `json:"labels,omitempty"`
	StartTime      time.Time                  `json:"start_time"`
	LastUpdate     time.Time                  `json:"last_update"`
	IsRunning      bool                       `json:"is_running"`
	IsComplete     bool                       `json:"is_complete"`
	ELClient       string                     `json:"el_client"`
	CLClient       string                     `json:"cl_client"`
	CurrentMetrics *reporting.ProgressMetrics `json:"current_metrics,omitempty"`
	SystemInfo     *sysinfo.SystemInfo        `json:"system_info,omitempty"`
}

type TestDetail struct {
	TestSummary
	ProgressHistory []ProgressPoint        `json:"progress_history"`
	ELClientConfig  reporting.ClientConfig `json:"el_client_config"`
	CLClientConfig  reporting.ClientConfig `json:"cl_client_config"`
	EnclaveName     string                 `json:"enclave_name"`
	EndTime         *time.Time             `json:"end_time,omitempty"`
	Error           string                 `json:"error,omitempty"`
}

type ProgressPoint struct {
	Timestamp time.Time                 `json:"timestamp"`
	Metrics   reporting.ProgressMetrics `json:"metrics"`
}

type TestListResponse struct {
	Tests       []TestSummary `json:"tests"`
	TotalCount  int           `json:"total_count"`
	ActiveCount int           `json:"active_count"`
}

// SSE event types
type SSEEvent struct {
	Type      string      `json:"type"` // "test_start", "test_progress", "test_complete"
	RunID     string      `json:"run_id"`
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data"`
}
