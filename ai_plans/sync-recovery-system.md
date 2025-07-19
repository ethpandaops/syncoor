# Sync Recovery System Implementation Plan

## Executive Summary
> **Problem**: When sync commands are canceled (timeout, SIGTERM, etc.), all progress is lost and needs to be restarted from scratch, wasting time and resources.
>
> **Solution**: Implement a recovery system that saves temporary reports during sync operations and can resume from existing Kurtosis enclaves that match the exact client configuration.
>
> **Technical Approach**: Add signal handling to the sync command, implement temporary report persistence, extend Kurtosis client with enclave discovery capabilities, and add recovery logic that matches configurations and validates enclave state.
>
> **Expected Outcomes**: Users can recover from interrupted sync operations instead of starting over, reducing wasted time and infrastructure costs.

## Goals & Objectives
### Primary Goals
- Save temporary progress reports when sync operations are interrupted
- Automatically recover sync state from existing enclaves with matching configuration
- Remove temporary reports upon successful completion

### Secondary Objectives
- Improve sync command reliability and user experience
- Reduce infrastructure waste from restarting interrupted operations
- Provide visibility into recovery operations through logging

## Solution Overview
### Approach
Extend the existing sync command with signal handling, temporary report persistence, and enclave discovery. The system will save `.tmp.json` reports during sync operations and check for recoverable state on startup.

### Key Components
1. **Signal Handling**: Add graceful shutdown handling to sync command
2. **Temporary Report System**: Extend report service with temporary report capabilities
3. **Enclave Discovery**: Add Kurtosis client methods for listing and inspecting enclaves
4. **Recovery Logic**: Implement configuration matching and state validation
5. **Cleanup System**: Automatic removal of temporary reports on success

### Data Flow
```
Sync Start → Check Existing .tmp.json → Match Config → Validate Enclave → Resume/Start
     ↓                                                                         ↓
Signal Received → Save .tmp.json → Graceful Shutdown                    Continue Sync
                                                                              ↓
                                                              Success → Remove .tmp.json
```

### Expected Outcomes
- The sync command can be interrupted and resumed without losing progress
- Temporary reports are automatically cleaned up on successful completion
- Users receive clear feedback about recovery operations

## Implementation Tasks

### CRITICAL IMPLEMENTATION RULES
1. **NO PLACEHOLDER CODE**: Every implementation must be production-ready using existing patterns
2. **COMPLETE IMPLEMENTATIONS**: Each task must fully implement its feature including all integration points
3. **FOLLOW STANDARDS**: Use ethPandaOps Go standards, logrus logging, and existing error handling patterns
4. **CONTEXT AWARENESS**: All operations must respect context cancellation and timeout handling

### Visual Dependency Tree
```
pkg/
├── kurtosis/
│   └── client.go (Task #1: Add enclave discovery methods)
│
├── recovery/
│   ├── recovery.go (Task #2: Core recovery service)
│   ├── config.go (Task #3: Configuration matching logic)
│   └── state.go (Task #4: Enclave state validation)
│
├── report/
│   └── service.go (Task #5: Extend with temporary report methods)
│
├── synctest/
│   └── service.go (Task #6: Integrate recovery into sync service)
│
└── cmd/syncoor/
    └── sync.go (Task #7: Add signal handling and recovery initialization)
```

### Execution Plan

#### Group A: Foundation Components (Execute all in parallel)
- [x] **Task #1**: Extend Kurtosis client with enclave existence check
  - **Folder**: `pkg/kurtosis/`
  - **File**: `client.go`
  - **Implements**:
    ```go
    // Add to Client interface
    DoesEnclaveExist(ctx context.Context, enclaveName string) (bool, error)
    ```
  - **Methods**:
    - `DoesEnclaveExist()`: Execute `kurtosis enclave inspect {name}` and check return code (0=exists, non-zero=doesn't exist)
  - **Error Handling**: Return false for non-zero exit codes, only return error for command execution failures
  - **Context**: Used by recovery service to check if target enclave exists before attempting recovery

- [x] **Task #2**: Create recovery service core
  - **Folder**: `pkg/recovery/`
  - **File**: `recovery.go`
  - **Implements**:
    ```go
    type Service interface {
        Start(ctx context.Context) error
        Stop() error
        CheckRecoverable(ctx context.Context, cfg *synctest.Config) (*RecoveryState, error)
        ValidateEnclave(ctx context.Context, enclaveName string, cfg *synctest.Config) error
    }

    type RecoveryState struct {
        EnclaveName    string                 `json:"enclave_name"`
        TempReportPath string                 `json:"temp_report_path"`
        Config         *synctest.Config       `json:"config"`
        LastUpdate     time.Time              `json:"last_update"`
        Progress       *report.SyncProgress   `json:"progress"`
    }
    ```
  - **Dependencies**:
    - `import "github.com/ethpandaops/syncoor/pkg/kurtosis"`
    - `import "github.com/ethpandaops/syncoor/pkg/synctest"`
    - `import "github.com/sirupsen/logrus"`
  - **Constructor**: `NewService(kurtosisClient kurtosis.Client, log logrus.FieldLogger) Service`
  - **Context**: Central orchestrator for recovery operations

- [x] **Task #3**: Implement configuration matching logic
  - **Folder**: `pkg/recovery/`
  - **File**: `config.go`
  - **Implements**:
    ```go
    type ConfigMatcher struct {
        log logrus.FieldLogger
    }

    func NewConfigMatcher(log logrus.FieldLogger) *ConfigMatcher
    func (cm *ConfigMatcher) MatchesConfig(existing, desired *synctest.Config) bool
    func (cm *ConfigMatcher) GenerateEnclavePattern(cfg *synctest.Config) string
    func (cm *ConfigMatcher) ParseEnclaveConfig(enclaveName string) (*synctest.Config, error)
    ```
  - **Matching Logic**:
    - **Exact matches**: Network, ELClient, CLClient (required)
    - **Image matches**: ELImage, CLImage (if specified)
    - **Args compatibility**: ELExtraArgs, CLExtraArgs (subset matching)
  - **Pattern**: `sync-test-{network}-{elclient}-{clclient}`
  - **Recovery Flow**: Generate expected enclave name from config, then use `DoesEnclaveExist` to check if it exists
  - **Context**: Determines if existing enclaves can be used for recovery

- [x] **Task #4**: Create enclave state validation
  - **Folder**: `pkg/recovery/`
  - **File**: `state.go`
  - **Implements**:
    ```go
    type StateValidator struct {
        kurtosisClient kurtosis.Client
        log            logrus.FieldLogger
    }

    func NewStateValidator(client kurtosis.Client, log logrus.FieldLogger) *StateValidator
    func (sv *StateValidator) ValidateEnclave(ctx context.Context, enclaveName string, cfg *synctest.Config) error
    func (sv *StateValidator) CheckServiceHealth(ctx context.Context, enclaveName, serviceName string) error
    ```
  - **Validation Checks**:
    - Enclave exists (using `DoesEnclaveExist()`)
    - Expected services are accessible (using existing `InspectService()` method)
    - Services are healthy and responding to inspection calls
  - **Simplified Approach**: Use existing `InspectService()` method to validate expected services (EL, CL, metrics-exporter)
  - **Context**: Ensures enclave is in valid state for recovery by checking service accessibility

#### Group B: Report System Extensions (Execute all in parallel after Group A)
- [x] **Task #5**: Extend report service with temporary reports
  - **Folder**: `pkg/report/`
  - **File**: `service.go`
  - **Implements**:
    ```go
    // Add to Service interface
    SaveTempReport(ctx context.Context, report *Report) error
    LoadTempReport(ctx context.Context, cfg *synctest.Config) (*Report, error)
    RemoveTempReport(ctx context.Context, cfg *synctest.Config) error
    ListTempReports(ctx context.Context) ([]string, error)

    // Add to struct
    type tempReportConfig struct {
        enabled    bool
        reportDir  string
        nameFormat string
    }
    ```
  - **File Naming**: `{runid}-{network}_{el}_{cl}.tmp.json`
  - **Location**: Same as regular reports (`./reports` by default)
  - **Methods**:
    - `SaveTempReport()`: Save current sync progress to `.tmp.json`
    - `LoadTempReport()`: Load existing temp report matching config
    - `RemoveTempReport()`: Clean up temp report on success
    - `ListTempReports()`: Find all temp reports in directory
  - **Context**: Persistence layer for temporary sync state

#### Group C: Service Integration (Execute all in parallel after Group B)
- [x] **Task #6**: Integrate recovery into sync service
  - **Folder**: `pkg/synctest/`
  - **File**: `service.go`
  - **Implements**:
    ```go
    // Add to Service struct
    recoveryService recovery.Service
    tempReportSaved bool

    // Add to Service interface
    EnableRecovery(recovery.Service)
    SaveTempReport(ctx context.Context) error
    ```
  - **Integration Points**:
    - Constructor: Accept optional recovery service
    - `Start()`: Check for recoverable state before creating new enclave
    - `WaitForSync()`: Periodically save temp reports during sync
    - `Stop()`: Save temp report on graceful shutdown
    - Success path: Remove temp report on completion
  - **Recovery Flow**:
    1. Check for existing temp report matching config
    2. If found, generate expected enclave name from config
    3. Use `DoesEnclaveExist` to check if enclave exists
    4. If exists, validate enclave state and resume sync
    5. If not exists or invalid, clean up and start fresh
  - **Context**: Main service that orchestrates sync operations

#### Group D: Command Integration (Execute after Group C)
- [x] **Task #7**: Add signal handling and recovery to sync command
  - **Folder**: `cmd/syncoor/`
  - **File**: `sync.go`
  - **Implements**:
    ```go
    // Add signal handling
    func setupSignalHandling(ctx context.Context, cancel context.CancelFunc, service synctest.Service) {
        sigChan := make(chan os.Signal, 1)
        signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

        go func() {
            select {
            case sig := <-sigChan:
                log.WithField("signal", sig).Info("Received signal, saving progress and shutting down")
                if err := service.SaveTempReport(ctx); err != nil {
                    log.WithError(err).Error("Failed to save temp report")
                }
                cancel()
            case <-ctx.Done():
                return
            }
        }()
    }
    ```
  - **Signal Handling**: Capture SIGINT, SIGTERM, and timeout events
  - **Recovery Initialization**: Create recovery service if flag enabled
  - **Flag Addition**: `--enable-recovery` flag (default: true)
  - **Context Integration**: Replace `context.Background()` with cancellable context
  - **Logging**: Add recovery-specific log messages with consistent fields
  - **Error Handling**: Graceful degradation if recovery fails
  - **Context**: Entry point that coordinates signal handling and recovery

---

## Implementation Workflow

This plan file serves as the authoritative checklist for implementation. When implementing:

### Required Process
1. **Load Plan**: Read this entire plan file before starting
2. **Sync Tasks**: Create TodoWrite tasks matching the checkboxes above
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
- Tasks should be run in parallel within groups to avoid context bloat

### Progress Tracking
The checkboxes above represent the authoritative status of each task. Keep them updated as you work.
