package reporting

import "github.com/ethpandaops/syncoor/pkg/sysinfo"

// TestKeepaliveRequest represents a keepalive request to maintain test connection
type TestKeepaliveRequest struct {
	RunID       string              `json:"run_id"`
	Timestamp   int64               `json:"timestamp"`
	Network     string              `json:"network"`
	Labels      map[string]string   `json:"labels,omitempty"`
	ELClient    ClientConfig        `json:"el_client"`
	CLClient    ClientConfig        `json:"cl_client"`
	EnclaveName string              `json:"enclave_name"`
	SystemInfo  *sysinfo.SystemInfo `json:"system_info,omitempty"`
	RunTimeout  int64               `json:"run_timeout,omitempty"`
}

type ClientConfig struct {
	Type      string            `json:"type"`
	Image     string            `json:"image"`
	ExtraArgs []string          `json:"extra_args,omitempty"`
	EnvVars   map[string]string `json:"env_vars,omitempty"`
}

type ProgressUpdateRequest struct {
	Timestamp  int64           `json:"timestamp"`
	Metrics    ProgressMetrics `json:"metrics"`
	IsComplete bool            `json:"is_complete"`
}

type ProgressMetrics struct {
	Block           uint64  `json:"block"`
	Slot            uint64  `json:"slot"`
	ExecDiskUsage   uint64  `json:"exec_disk_usage"`
	ConsDiskUsage   uint64  `json:"cons_disk_usage"`
	ExecPeers       uint64  `json:"exec_peers"`
	ConsPeers       uint64  `json:"cons_peers"`
	ExecSyncPercent float64 `json:"exec_sync_percent"`
	ConsSyncPercent float64 `json:"cons_sync_percent"`
	ExecVersion     string  `json:"exec_version,omitempty"`
	ConsVersion     string  `json:"cons_version,omitempty"`
}

type TestCompleteRequest struct {
	Timestamp  int64  `json:"timestamp"`
	FinalBlock uint64 `json:"final_block"`
	FinalSlot  uint64 `json:"final_slot"`
	Success    bool   `json:"success"`
	Error      string `json:"error,omitempty"`
}
