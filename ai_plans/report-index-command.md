# Report Index Command Implementation Plan

## Executive Summary
> This implementation adds a new "report-index" subcommand to the syncoor CLI that generates an index.json file containing metadata from all *.main.json report files in a specified directory. The command will scan report files, extract key information (timestamps, network, client types/versions, sync status), and create a time-ordered index for easy navigation and analysis of test results.

## Goals & Objectives
### Primary Goals
- Add `syncoor report-index` subcommand with `--report-dir` flag
- Generate `index.json` with metadata from all `*.main.json` files
- Order index entries by test run timestamps (newest first)
- Extract network, sync_status, and client information from reports

### Secondary Objectives
- Follow existing syncoor CLI patterns and conventions
- Provide clean error handling for malformed reports
- Support future extensibility for additional index formats
- Maintain backward compatibility with existing report formats

## Solution Overview
### Approach
The solution follows syncoor's established CLI patterns using Cobra framework. A new subcommand will be added that:
1. Scans the specified directory for `*.main.json` files
2. Parses each file to extract required metadata
3. Sorts entries by timestamp (descending)
4. Outputs structured JSON index

### Key Components
1. **CLI Command**: New subcommand in `cmd/syncoor/report-index.go`
2. **Extended Report Package**: Add index functionality to existing `pkg/report/`
3. **Index Types**: Data structures for index entries in `pkg/report/`
4. **JSON Output**: Structured index.json generation using existing patterns

### Expected Outcomes
- Users can run `syncoor report-index --report-dir ./reports` to generate an index
- The index.json file contains ordered metadata for easy report navigation
- CLI follows existing syncoor patterns and conventions
- Error handling provides clear feedback for malformed reports

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
cmd/syncoor/
├── main.go (Task #2: Register new subcommand)
├── report-index.go (Task #1: Create report-index subcommand)
│
pkg/report/
├── service.go (Task #0: Extend with index types and functions)
```

### Execution Plan

#### Group A: Foundation (Execute all in parallel)
- [x] **Task #0**: Extend pkg/report with index types and functions
  - Folder: `pkg/report/`
  - File: `service.go`
  - Imports to add:
    - `path/filepath`
    - `sort`
    - `strings`
  - Implements new types:
    - `IndexEntry` struct with fields:
      ```go
      type IndexEntry struct {
          RunID                string              `json:"run_id"`
          Timestamp            int64               `json:"timestamp"`
          Network              string              `json:"network"`
          SyncStatus           IndexSyncInfo       `json:"sync_status"`
          ExecutionClientInfo  IndexClientInfo     `json:"execution_client_info"`
          ConsensusClientInfo  IndexClientInfo     `json:"consensus_client_info"`
          ReportFile           string              `json:"report_file"`
      }
      
      type IndexSyncInfo struct {
          Start int64  `json:"start"`
          End   int64  `json:"end"`
          Block uint64 `json:"block"`
          Slot  uint64 `json:"slot"`
      }
      
      type IndexClientInfo struct {
          Type    string `json:"type"`
          Version string `json:"version"`
      }
      
      type Index struct {
          GeneratedAt int64        `json:"generated_at"`
          ReportDir   string       `json:"report_dir"`
          Entries     []IndexEntry `json:"entries"`
      }
      ```
  - New interface for index operations:
    ```go
    type IndexService interface {
        GenerateIndex(ctx context.Context, reportDir string) (*Index, error)
        WriteIndex(ctx context.Context, index *Index, outputFile string) error
    }
    ```
  - New indexService implementation:
    ```go
    type indexService struct {
        log logrus.FieldLogger
    }
    
    func NewIndexService(log logrus.FieldLogger) IndexService
    func (s *indexService) GenerateIndex(ctx context.Context, reportDir string) (*Index, error)
    func (s *indexService) WriteIndex(ctx context.Context, index *Index, outputFile string) error
    ```
  - Internal helper functions:
    ```go
    func (s *indexService) scanReportFiles(reportDir string) ([]string, error)
    func (s *indexService) parseReport(filePath string) (*IndexEntry, error)
    func (s *indexService) extractNetworkFromFilename(filename string) string
    func (s *indexService) sortEntriesByTimestamp(entries []IndexEntry)
    ```
  - Exports: IndexService, Index, IndexEntry, IndexSyncInfo, IndexClientInfo, NewIndexService
  - Context: Extends existing pkg/report with index generation functionality
  - Integration: Reuses existing Result and ClientInfo types for parsing, follows existing patterns

#### Group B: CLI Integration (Execute after Group A)
- [x] **Task #1**: Create report-index subcommand
  - Folder: `cmd/syncoor/`
  - File: `report-index.go`
  - Imports:
    - `context`
    - `github.com/spf13/cobra`
    - `github.com/sirupsen/logrus`
    - `github.com/ethpandaops/syncoor/pkg/report`
    - `path/filepath`
    - `os`
  - Implements:
    - `NewReportIndexCommand() *cobra.Command` function
    - Command configuration:
      ```go
      Use:   "report-index"
      Short: "Generate index of sync test reports"
      Long:  "Generate an index.json file containing metadata from all *.main.json report files in the specified directory, ordered by timestamp"
      ```
    - Flags:
      ```go
      var (
          reportDir  string
          outputFile string
      )
      
      cmd.Flags().StringVar(&reportDir, "report-dir", "./reports", "Directory containing *.main.json report files")
      cmd.Flags().StringVar(&outputFile, "output", "index.json", "Output file name for the generated index")
      ```
    - RunE implementation:
      ```go
      RunE: func(cmd *cobra.Command, args []string) error {
          logrus.WithFields(logrus.Fields{
              "report_dir": reportDir,
              "output_file": outputFile,
          }).Info("Generating report index")
          
          // Create service instance
          service := report.NewIndexService(logrus.StandardLogger())
          
          // Generate index
          ctx := context.Background()
          index, err := service.GenerateIndex(ctx, reportDir)
          if err != nil {
              return fmt.Errorf("failed to generate index: %w", err)
          }
          
          // Write index to file
          if err := service.WriteIndex(ctx, index, outputFile); err != nil {
              return fmt.Errorf("failed to write index: %w", err)
          }
          
          logrus.WithFields(logrus.Fields{
              "entries": len(index.Entries),
              "output_file": outputFile,
          }).Info("Report index generated successfully")
          
          return nil
      }
      ```
  - Exports: NewReportIndexCommand function
  - Context: CLI command that uses report.IndexService to generate index files
  - Integration: Registered in main.go, follows existing CLI patterns

- [x] **Task #2**: Register report-index subcommand in main CLI
  - Folder: `cmd/syncoor/`
  - File: `main.go`
  - Modification: Add subcommand registration
  - In `init()` function, add:
    ```go
    rootCmd.AddCommand(NewReportIndexCommand())
    ```
  - Context: Makes the new subcommand available in the CLI
  - Integration: Follows existing pattern used by sync and server commands

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