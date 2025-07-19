# Centralized Server Implementation Plan

## Executive Summary
> This plan transforms syncoor from a standalone CLI tool into a distributed monitoring system with a centralized server that collects and aggregates sync test data from multiple test runners. The architecture introduces a new `syncoor server` subcommand that runs an HTTP API server to receive progress reports from distributed `syncoor sync` instances. Each sync test can optionally report its progress to the centralized server using `--server` and `--server-auth` flags. The server maintains all data in-memory, providing real-time visibility into multiple concurrent sync tests across different environments without requiring persistent storage.

## Goals & Objectives
### Primary Goals
- Enable centralized monitoring of distributed sync tests with real-time progress visibility
- Support concurrent monitoring of 100+ sync tests with sub-second update latency

### Secondary Objectives
- Maintain zero-dependency operation mode when server reporting is disabled
- Provide simple authentication mechanism for secure deployments
- Enable dashboard integration through RESTful API and SSE streams
- Support graceful handling of network failures without impacting sync tests

## Solution Overview
### Approach
The solution splits syncoor into two operational modes: the existing sync test runner and a new centralized server. Sync runners optionally push progress updates to the server via HTTP POST requests. The server maintains an in-memory store of all active and recent tests, exposing this data through REST APIs and SSE streams for real-time monitoring.

### Key Components
1. **Server Command**: New `server` subcommand with HTTP API and in-memory storage
2. **Reporting Client**: HTTP client in sync command that sends periodic updates
3. **Authentication**: Simple bearer token authentication for server API
4. **Progress Protocol**: JSON-based protocol for start/progress/complete events
5. **Memory Management**: Automatic cleanup of old test data to prevent unbounded growth

### Architecture Diagram
```
[Sync Runner 1] --HTTP POST--> [Centralized Server] <--GET/SSE-- [Dashboard]
[Sync Runner 2] --HTTP POST--> [    In-Memory     ] <--GET/SSE-- [Monitoring]
[Sync Runner N] --HTTP POST--> [    Data Store    ] <--GET/SSE-- [API Client]
```

### Data Flow
```
Sync Test Start → POST /api/v1/tests/start → Server Memory → GET /api/v1/tests
     ↓
Progress Loop → POST /api/v1/tests/{id}/progress → Server Memory → SSE Updates
     ↓
Test Complete → POST /api/v1/tests/{id}/complete → Server Memory → Final State
```

### Expected Outcomes
- Operators can monitor all sync tests via `GET /api/v1/tests` endpoint
- Real-time progress streams available through SSE at `/api/v1/events`
- Sync tests continue normally even if server is unreachable
- Server automatically cleans up data older than 24 hours

## Implementation Tasks

### CRITICAL IMPLEMENTATION RULES
1. **NO PLACEHOLDER CODE**: Every implementation must be production-ready. NEVER write "TODO", "in a real implementation", or similar placeholders unless explicitly requested by the user.
2. **CROSS-DIRECTORY TASKS**: Group related changes across directories into single tasks to ensure consistency. Never create isolated changes that require follow-up work in sibling directories.
3. **COMPLETE IMPLEMENTATIONS**: Each task must fully implement its feature including all consumers, type updates, and integration points.
4. **DETAILED SPECIFICATIONS**: Each task must include EXACTLY what to implement, including specific functions, types, and integration points to avoid "breaking change" confusion.
5. **CONTEXT AWARENESS**: Each task is part of a larger system - specify how it connects to other parts.
6. **MAKE BREAKING CHANGES**: Unless explicitly requested by the user, you MUST make breaking changes.

### Visual Dependency Tree
```
cmd/
└── syncoor/
    ├── main.go (Task #8: Add server subcommand)
    └── server.go (Task #7: Implement server command)

pkg/
├── api/
│   ├── types.go (Task #1: Protocol types and API contracts)
│   ├── server.go (Task #2: HTTP server implementation)
│   ├── handlers.go (Task #3: Request handlers)
│   ├── store.go (Task #4: In-memory data store)
│   ├── auth.go (Task #5: Authentication middleware)
│   └── sse.go (Task #6: SSE streaming)
│
├── reporting/
│   ├── client.go (Task #1: HTTP reporting client)
│   └── types.go (Task #1: Shared protocol types)
│
└── synctest/
    ├── config.go (Task #0: Add server config fields)
    └── service.go (Task #9: Integrate reporting client)
```

### Execution Plan

#### Group A: Foundation (Execute all in parallel)
- [ ] **Task #0**: Add server configuration to sync command
  - Folder: `pkg/synctest/`
  - File: `config.go`
  - Adds to Config struct:
    ```go
    ServerURL  string // e.g., "https://api.syncoor.example"
    ServerAuth string // Bearer token for authentication
    ```
  - Updates NewConfig() to set empty defaults
  - Context: These fields control whether sync tests report to server

#### Group B: Protocol and Types (Execute all in parallel after Group A)
- [ ] **Task #1**: Define protocol types and reporting client
  - Folder: `pkg/reporting/`
  - File: `types.go`
  - Implements:
    ```go
    package reporting
    
    import "time"
    
    // Protocol messages
    type TestStartRequest struct {
        RunID       string            `json:"run_id"`
        Timestamp   int64             `json:"timestamp"`
        Network     string            `json:"network"`
        Labels      map[string]string `json:"labels,omitempty"`
        ELClient    ClientConfig      `json:"el_client"`
        CLClient    ClientConfig      `json:"cl_client"`
        EnclaveName string            `json:"enclave_name"`
    }
    
    type ClientConfig struct {
        Type     string   `json:"type"`
        Image    string   `json:"image"`
        ExtraArgs []string `json:"extra_args,omitempty"`
    }
    
    type ProgressUpdateRequest struct {
        Timestamp   int64         `json:"timestamp"`
        Metrics     ProgressMetrics `json:"metrics"`
        IsComplete  bool          `json:"is_complete"`
    }
    
    type ProgressMetrics struct {
        Block                uint64  `json:"block"`
        Slot                 uint64  `json:"slot"`
        ExecDiskUsage        uint64  `json:"exec_disk_usage"`
        ConsDiskUsage        uint64  `json:"cons_disk_usage"`
        ExecPeers            uint64  `json:"exec_peers"`
        ConsPeers            uint64  `json:"cons_peers"`
        ExecSyncPercent      float64 `json:"exec_sync_percent"`
        ConsSyncPercent      float64 `json:"cons_sync_percent"`
        ExecVersion          string  `json:"exec_version,omitempty"`
        ConsVersion          string  `json:"cons_version,omitempty"`
    }
    
    type TestCompleteRequest struct {
        Timestamp    int64  `json:"timestamp"`
        FinalBlock   uint64 `json:"final_block"`
        FinalSlot    uint64 `json:"final_slot"`
        Success      bool   `json:"success"`
        Error        string `json:"error,omitempty"`
    }
    ```
  - Exports: All protocol types
  - Context: Shared between client and server for protocol consistency
  
  - File: `client.go`
  - Imports:
    ```go
    import (
        "bytes"
        "context"
        "encoding/json"
        "fmt"
        "net/http"
        "time"
        
        "github.com/sirupsen/logrus"
        "gopkg.in/cenkalti/backoff.v1"
    )
    ```
  - Implements:
    ```go
    type Client struct {
        serverURL   string
        authToken   string
        httpClient  *http.Client
        log         logrus.FieldLogger
        
        // Buffering for resilience
        updateQueue chan ProgressUpdateRequest
        stopCh      chan struct{}
    }
    
    func NewClient(serverURL, authToken string, log logrus.FieldLogger) *Client
    func (c *Client) Start(ctx context.Context)
    func (c *Client) Stop()
    
    // Main reporting methods
    func (c *Client) ReportTestStart(ctx context.Context, req TestStartRequest) error
    func (c *Client) ReportProgress(metrics ProgressMetrics) // Non-blocking
    func (c *Client) ReportTestComplete(ctx context.Context, req TestCompleteRequest) error
    
    // Internal methods
    func (c *Client) sendRequest(ctx context.Context, method, path string, body interface{}) error
    func (c *Client) processUpdateQueue(ctx context.Context)
    func (c *Client) sendProgressUpdate(ctx context.Context, runID string, update ProgressUpdateRequest) error
    ```
  - Features:
    - Non-blocking progress updates via channel
    - Exponential backoff for retries
    - Graceful shutdown
    - Request queuing during network issues
  - Exports: Client struct and methods
  - Context: Used by sync service to report progress
  
  - Folder: `pkg/api/`
  - File: `types.go`
  - Implements:
    ```go
    package api
    
    import (
        "time"
        "github.com/ethpandaops/syncoor/pkg/reporting"
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
        RunID           string                   `json:"run_id"`
        Network         string                   `json:"network"`
        Labels          map[string]string        `json:"labels,omitempty"`
        StartTime       time.Time                `json:"start_time"`
        LastUpdate      time.Time                `json:"last_update"`
        IsRunning       bool                     `json:"is_running"`
        IsComplete      bool                     `json:"is_complete"`
        ELClient        string                   `json:"el_client"`
        CLClient        string                   `json:"cl_client"`
        CurrentMetrics  *reporting.ProgressMetrics `json:"current_metrics,omitempty"`
    }
    
    type TestDetail struct {
        TestSummary
        ProgressHistory []ProgressPoint `json:"progress_history"`
        ELClientConfig  reporting.ClientConfig `json:"el_client_config"`
        CLClientConfig  reporting.ClientConfig `json:"cl_client_config"`
        EnclaveName     string                 `json:"enclave_name"`
        EndTime         *time.Time             `json:"end_time,omitempty"`
        Error           string                 `json:"error,omitempty"`
    }
    
    type ProgressPoint struct {
        Timestamp time.Time                  `json:"timestamp"`
        Metrics   reporting.ProgressMetrics  `json:"metrics"`
    }
    
    type TestListResponse struct {
        Tests      []TestSummary `json:"tests"`
        TotalCount int           `json:"total_count"`
        ActiveCount int          `json:"active_count"`
    }
    
    // SSE event types
    type SSEEvent struct {
        Type      string      `json:"type"` // "test_start", "test_progress", "test_complete"
        RunID     string      `json:"run_id"`
        Timestamp time.Time   `json:"timestamp"`
        Data      interface{} `json:"data"`
    }
    ```
  - Exports: All API response types
  - Context: Defines server API contract

#### Group C: Server Core Implementation (Execute after Group B)
- [ ] **Task #2**: Create HTTP server with graceful shutdown
  - Folder: `pkg/api/`
  - File: `server.go`
  - Imports:
    ```go
    import (
        "context"
        "fmt"
        "net/http"
        "os"
        "os/signal"
        "sync"
        "syscall"
        "time"
        
        "github.com/prometheus/client_golang/prometheus/promhttp"
        "github.com/r3labs/sse/v2"
        "github.com/sirupsen/logrus"
    )
    ```
  - Implements:
    ```go
    type Server struct {
        log        logrus.FieldLogger
        httpServer *http.Server
        router     *http.ServeMux
        sseServer  *sse.Server
        store      *Store
        authToken  string
        
        shutdownOnce sync.Once
    }
    
    func NewServer(log logrus.FieldLogger, addr string, authToken string) *Server
    func (s *Server) Start(ctx context.Context) error
    func (s *Server) Stop(ctx context.Context) error
    
    // Setup methods
    func (s *Server) setupRoutes()
    func (s *Server) setupSSE()
    func (s *Server) setupMetrics()
    
    // Helper methods
    func (s *Server) writeJSON(w http.ResponseWriter, status int, v interface{})
    func (s *Server) writeError(w http.ResponseWriter, err error, status int)
    ```
  - Routes setup:
    ```go
    // Client endpoints (require auth)
    POST /api/v1/tests/start
    POST /api/v1/tests/{runId}/progress
    POST /api/v1/tests/{runId}/complete
    
    // Public endpoints (no auth)
    GET  /api/v1/tests
    GET  /api/v1/tests/{runId}
    GET  /api/v1/events (SSE)
    GET  /health
    GET  /metrics
    ```
  - Exports: Server struct and methods
  - Context: Main HTTP server hosting all endpoints

- [ ] **Task #3**: Implement request handlers
  - Folder: `pkg/api/`
  - File: `handlers.go`
  - Imports:
    ```go
    import (
        "encoding/json"
        "net/http"
        "strings"
        
        "github.com/ethpandaops/syncoor/pkg/reporting"
    )
    ```
  - Implements:
    ```go
    // Client endpoints (authenticated)
    func (s *Server) handleTestStart(w http.ResponseWriter, r *http.Request)
    func (s *Server) handleTestProgress(w http.ResponseWriter, r *http.Request)
    func (s *Server) handleTestComplete(w http.ResponseWriter, r *http.Request)
    
    // Public endpoints
    func (s *Server) handleTestList(w http.ResponseWriter, r *http.Request)
    func (s *Server) handleTestDetail(w http.ResponseWriter, r *http.Request)
    func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request)
    
    // Helper to extract runId from URL
    func getRunID(r *http.Request) string
    ```
  - Handler logic:
    - Validate request bodies
    - Update store with new data
    - Publish SSE events
    - Return appropriate responses
  - Error handling:
    - 400 for invalid requests
    - 401 for auth failures
    - 404 for unknown tests
    - 500 for server errors
  - Exports: Handler methods
  - Context: Implements business logic for each endpoint

#### Group D: Data Storage and Streaming (Execute after Group C)
- [ ] **Task #4**: Implement in-memory data store
  - Folder: `pkg/api/`
  - File: `store.go`
  - Imports:
    ```go
    import (
        "fmt"
        "sync"
        "time"
        
        "github.com/ethpandaops/syncoor/pkg/reporting"
    )
    ```
  - Implements:
    ```go
    type Store struct {
        mu    sync.RWMutex
        tests map[string]*TestData
        
        // Cleanup configuration
        maxAge      time.Duration
        maxHistory  int // Max progress points per test
        cleanupTick *time.Ticker
    }
    
    type TestData struct {
        RunID          string
        Network        string
        Labels         map[string]string
        StartTime      time.Time
        LastUpdate     time.Time
        EndTime        *time.Time
        IsRunning      bool
        IsComplete     bool
        Error          string
        
        ELClient       reporting.ClientConfig
        CLClient       reporting.ClientConfig
        EnclaveName    string
        
        CurrentMetrics *reporting.ProgressMetrics
        History        []ProgressPoint
    }
    
    func NewStore() *Store
    func (s *Store) Start() // Starts cleanup goroutine
    func (s *Store) Stop()  // Stops cleanup
    
    // Write operations
    func (s *Store) CreateTest(req reporting.TestStartRequest) error
    func (s *Store) UpdateProgress(runID string, metrics reporting.ProgressMetrics) error
    func (s *Store) CompleteTest(runID string, req reporting.TestCompleteRequest) error
    
    // Read operations
    func (s *Store) GetTest(runID string) (*TestData, error)
    func (s *Store) ListTests(activeOnly bool) []TestSummary
    func (s *Store) GetTestDetail(runID string) (*TestDetail, error)
    
    // Maintenance
    func (s *Store) cleanup() // Removes old tests
    func (s *Store) trimHistory(td *TestData) // Limits history size
    ```
  - Features:
    - Thread-safe concurrent access
    - Automatic cleanup of old data (>24h)
    - History trimming to prevent unbounded growth
    - Efficient lookups by runID
  - Exports: Store struct and methods
  - Context: Central data repository for server

- [ ] **Task #5**: Implement authentication middleware
  - Folder: `pkg/api/`
  - File: `auth.go`
  - Imports:
    ```go
    import (
        "net/http"
        "strings"
    )
    ```
  - Implements:
    ```go
    func (s *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
        return func(w http.ResponseWriter, r *http.Request) {
            // Skip auth if no token configured
            if s.authToken == "" {
                next.ServeHTTP(w, r)
                return
            }
            
            // Check Authorization header
            auth := r.Header.Get("Authorization")
            if auth == "" {
                s.writeError(w, fmt.Errorf("missing authorization header"), http.StatusUnauthorized)
                return
            }
            
            // Validate bearer token
            parts := strings.SplitN(auth, " ", 2)
            if len(parts) != 2 || parts[0] != "Bearer" || parts[1] != s.authToken {
                s.writeError(w, fmt.Errorf("invalid authorization token"), http.StatusUnauthorized)
                return
            }
            
            next.ServeHTTP(w, r)
        }
    }
    
    func (s *Server) corsMiddleware(next http.HandlerFunc) http.HandlerFunc
    func (s *Server) loggingMiddleware(next http.HandlerFunc) http.HandlerFunc
    func (s *Server) recoveryMiddleware(next http.HandlerFunc) http.HandlerFunc
    ```
  - Features:
    - Bearer token authentication
    - Optional (disabled if no token set)
    - CORS support for browser access
    - Request logging
    - Panic recovery
  - Exports: Middleware functions
  - Context: Secures client endpoints while keeping read endpoints public

- [ ] **Task #6**: Implement SSE streaming
  - Folder: `pkg/api/`
  - File: `sse.go`
  - Imports:
    ```go
    import (
        "encoding/json"
        
        "github.com/r3labs/sse/v2"
    )
    ```
  - Implements:
    ```go
    func (s *Server) setupSSEStreams() {
        s.sseServer.CreateStream("tests")
    }
    
    func (s *Server) publishTestStart(runID string, test *TestData) {
        event := SSEEvent{
            Type:      "test_start",
            RunID:     runID,
            Timestamp: time.Now(),
            Data: map[string]interface{}{
                "network":   test.Network,
                "el_client": test.ELClient.Type,
                "cl_client": test.CLClient.Type,
                "labels":    test.Labels,
            },
        }
        s.publishEvent(event)
    }
    
    func (s *Server) publishTestProgress(runID string, metrics *reporting.ProgressMetrics) {
        event := SSEEvent{
            Type:      "test_progress",
            RunID:     runID,
            Timestamp: time.Now(),
            Data:      metrics,
        }
        s.publishEvent(event)
    }
    
    func (s *Server) publishTestComplete(runID string, success bool, error string) {
        event := SSEEvent{
            Type:      "test_complete",
            RunID:     runID,
            Timestamp: time.Now(),
            Data: map[string]interface{}{
                "success": success,
                "error":   error,
            },
        }
        s.publishEvent(event)
    }
    
    func (s *Server) publishEvent(event SSEEvent) {
        data, _ := json.Marshal(event)
        s.sseServer.Publish("tests", &sse.Event{
            Data: data,
        })
    }
    ```
  - Exports: SSE publishing methods
  - Context: Enables real-time monitoring in browsers/dashboards

#### Group E: Command Implementation (Execute after Group D)
- [ ] **Task #7**: Implement server command
  - Folder: `cmd/syncoor/`
  - File: `server.go` (new file)
  - Imports:
    ```go
    import (
        "context"
        "fmt"
        "os"
        
        "github.com/ethpandaops/syncoor/pkg/api"
        "github.com/sirupsen/logrus"
        "github.com/spf13/cobra"
    )
    ```
  - Implements:
    ```go
    type ServerConfig struct {
        ListenAddr string
        AuthToken  string
        LogLevel   string
    }
    
    func NewServerCommand() *cobra.Command {
        cfg := &ServerConfig{
            ListenAddr: ":8080",
            LogLevel:   "info",
        }
        
        cmd := &cobra.Command{
            Use:   "server",
            Short: "Run the centralized syncoor server",
            Long:  `Starts an HTTP server that receives sync test progress from distributed sync runners.`,
            RunE: func(cmd *cobra.Command, args []string) error {
                return runServer(cmd.Context(), cfg)
            },
        }
        
        // Add flags
        cmd.Flags().StringVar(&cfg.ListenAddr, "listen", ":8080", "Server listen address")
        cmd.Flags().StringVar(&cfg.AuthToken, "auth-token", "", "Bearer token for authentication (optional)")
        cmd.Flags().StringVar(&cfg.LogLevel, "log-level", "info", "Log level (debug, info, warn, error)")
        
        return cmd
    }
    
    func runServer(ctx context.Context, cfg *ServerConfig) error {
        // Setup logging
        log := logrus.New()
        level, _ := logrus.ParseLevel(cfg.LogLevel)
        log.SetLevel(level)
        
        // Create and start server
        server := api.NewServer(log, cfg.ListenAddr, cfg.AuthToken)
        
        log.WithField("addr", cfg.ListenAddr).Info("Starting syncoor server")
        if cfg.AuthToken != "" {
            log.Info("Authentication enabled")
        }
        
        return server.Start(ctx)
    }
    ```
  - Features:
    - Configurable listen address
    - Optional authentication
    - Structured logging
    - Graceful shutdown
  - Exports: NewServerCommand function
  - Context: Provides CLI interface for server

- [ ] **Task #8**: Add server command to main
  - Folder: `cmd/syncoor/`
  - File: `main.go`
  - Updates Execute function:
    ```go
    func Execute() {
        rootCmd := &cobra.Command{
            Use:   "syncoor",
            Short: "Ethereum sync testing tool",
        }
        
        // Add subcommands
        rootCmd.AddCommand(NewSyncCommand())
        rootCmd.AddCommand(NewServerCommand())
        
        // ... rest of setup
    }
    ```
  - Updates sync command setup to add new flags:
    ```go
    cmd.Flags().StringVar(&cfg.ServerURL, "server", "", "Centralized server URL (e.g., https://api.syncoor.example)")
    cmd.Flags().StringVar(&cfg.ServerAuth, "server-auth", "", "Bearer token for server authentication")
    ```
  - Context: Makes server available as subcommand

#### Group F: Client Integration (Execute after Group E)
- [ ] **Task #9**: Integrate reporting client into sync service
  - Folder: `pkg/synctest/`
  - File: `service.go`
  - Adds imports:
    ```go
    import "github.com/ethpandaops/syncoor/pkg/reporting"
    ```
  - Adds to Service struct:
    ```go
    reportingClient *reporting.Client
    ```
  - Updates NewService to initialize client if configured:
    ```go
    if config.ServerURL != "" {
        s.reportingClient = reporting.NewClient(
            config.ServerURL,
            config.ServerAuth,
            logger.WithField("component", "reporting"),
        )
    }
    ```
  - Updates Start() method:
    ```go
    // After setting up clients
    if s.reportingClient != nil {
        s.reportingClient.Start(ctx)
        defer s.reportingClient.Stop()
        
        // Report test start
        startReq := reporting.TestStartRequest{
            RunID:       runID,
            Timestamp:   time.Now().Unix(),
            Network:     s.config.Network,
            Labels:      s.config.Labels,
            ELClient: reporting.ClientConfig{
                Type:      s.config.ELClient,
                Image:     s.config.ELImage,
                ExtraArgs: s.config.ELExtraArgs,
            },
            CLClient: reporting.ClientConfig{
                Type:      s.config.CLClient,
                Image:     s.config.CLImage,
                ExtraArgs: s.config.CLExtraArgs,
            },
            EnclaveName: s.config.EnclaveName,
        }
        
        if err := s.reportingClient.ReportTestStart(ctx, startReq); err != nil {
            s.logger.WithError(err).Warn("Failed to report test start")
            // Continue anyway - reporting is optional
        }
    }
    ```
  - Updates WaitForSync() to report progress:
    ```go
    // Inside polling loop, after collecting metrics
    if s.reportingClient != nil {
        metrics := reporting.ProgressMetrics{
            Block:           execStatus.BlockNumber,
            Slot:            consHeadSlot,
            ExecDiskUsage:   metricsData.ExeDiskUsage,
            ConsDiskUsage:   metricsData.ConDiskUsage,
            ExecPeers:       metricsData.ExePeers,
            ConsPeers:       metricsData.ConPeers,
            ExecSyncPercent: execSyncPercent,
            ConsSyncPercent: consSyncPercent,
            ExecVersion:     metricsData.ExeVersion,
            ConsVersion:     metricsData.ConVersion,
        }
        s.reportingClient.ReportProgress(metrics) // Non-blocking
    }
    ```
  - Updates completion handling:
    ```go
    // When sync completes or fails
    if s.reportingClient != nil {
        completeReq := reporting.TestCompleteRequest{
            Timestamp:  time.Now().Unix(),
            FinalBlock: finalBlock,
            FinalSlot:  finalSlot,
            Success:    err == nil,
        }
        if err != nil {
            completeReq.Error = err.Error()
        }
        
        if err := s.reportingClient.ReportTestComplete(ctx, completeReq); err != nil {
            s.logger.WithError(err).Warn("Failed to report test completion")
        }
    }
    ```
  - Context: Integrates reporting throughout sync lifecycle

---

## Implementation Workflow

This plan file serves as the authoritative checklist for implementation. When implementing:

### Required Process
1. **Load Plan**: Read this entire plan file before starting
2. **Sync Tasks**: Create TodoWrite tasks matching the checkboxes below
3. **Execute & Update**: For each task:
   - Mark TodoWrite as `in_progress` when starting
   - Update checkbox `[ ]` to `[x]` when completing
   - Mark TodoWrite as `completed` when done
4. **Maintain Sync**: Keep this file and TodoWrite synchronized throughout

### Critical Rules
- This plan file is the source of truth for progress
- Update checkboxes in real-time as work progresses
- Never lose synchronization between plan file and TodoWrite
- Mark tasks complete only when fully implemented (no placeholders)
- Tasks should be run in parallel, unless there are dependencies, using subtasks, to avoid context bloat.

### Progress Tracking
The checkboxes above represent the authoritative status of each task. Keep them updated as you work.