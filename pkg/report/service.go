package report

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/sirupsen/logrus"
)

// Service defines the interface for report generation
type Service interface {
	Start(ctx context.Context) error
	AddSyncProgressEntry(ctx context.Context, entry SyncProgressEntry) error
	SetConsensusClientInfo(ctx context.Context, info *ClientInfo) error
	SetExecutionClientInfo(ctx context.Context, info *ClientInfo) error
	SetBlockNumber(ctx context.Context, blockNumber uint64) error
	SetSlotNumber(ctx context.Context, slotNumber uint64) error
	SetLabels(ctx context.Context, labels map[string]string) error
	SetNetwork(ctx context.Context, network string) error
	SaveReportToFiles(ctx context.Context, baseFilename string, reportDir string) error
	Stop(ctx context.Context) error
}

type Result struct {
	RunID               string            `json:"run_id"`
	Timestamp           int64             `json:"timestamp"`
	Network             string            `json:"network"`
	Labels              map[string]string `json:"labels,omitempty"`
	SyncStatus          SyncStatus        `json:"sync_status"`
	ExecutionClientInfo ClientInfo        `json:"execution_client_info"`
	ConsensusClientInfo ClientInfo        `json:"consensus_client_info"`
}

type ClientInfo struct {
	Name       string   `json:"name"`
	Type       string   `json:"type"`
	Image      string   `json:"image"`
	Entrypoint []string `json:"entrypoint"`
	Cmd        []string `json:"cmd"`
	Version    string   `json:"version"`
}

type SyncStatus struct {
	Start            int64               `json:"start"`
	End              int64               `json:"end"`
	Block            uint64              `json:"block"`
	Slot             uint64              `json:"slot"`
	SyncProgress     []SyncProgressEntry `json:"sync_progress,omitempty"`
	SyncProgressFile string              `json:"sync_progress_file,omitempty"`
}

// SyncProgressEntry represents the progress data at a specific timestamp
type SyncProgressEntry struct {
	T                        int64  `json:"t"`  // Timestamp
	Block                    uint64 `json:"b"`  // Execution client block number
	Slot                     uint64 `json:"s"`  // Consensus client slot number
	DiskUsageExecutionClient uint64 `json:"de"` // Execution client disk usage (bytes)
	DiskUsageConsensusClient uint64 `json:"dc"` // Consensus client disk usage (bytes)
	PeersExecutionClient     uint64 `json:"pe"` // Execution client peers
	PeersConsensusClient     uint64 `json:"pc"` // Consensus client peers
}

// service implements the Service interface
type service struct {
	log    logrus.FieldLogger
	result *Result
}

// NewService creates a new report service
func NewService(log logrus.FieldLogger) Service {
	r := &Result{}
	r.SyncStatus.SyncProgress = make([]SyncProgressEntry, 0)
	return &service{
		log:    log.WithField("package", "report"),
		result: r,
	}
}

func (s *service) Start(ctx context.Context) error {
	if s.result.RunID != "" {
		return errors.New("report service already started")
	}
	s.log.Debug("Starting report service")
	s.result.RunID = fmt.Sprintf("sync-test-%d", time.Now().UnixNano())
	now := time.Now().Unix()
	s.result.Timestamp = now
	s.result.SyncStatus.Start = now
	return nil
}

func (s *service) Stop(ctx context.Context) error {
	s.log.Debug("Stopping report service")
	s.result.SyncStatus.End = time.Now().Unix()
	return nil
}

func (s *service) SetBlockNumber(ctx context.Context, blockNumber uint64) error {
	s.log.WithField("blockNumber", blockNumber).Debug("Setting block number")
	s.result.SyncStatus.Block = blockNumber
	return nil
}

func (s *service) SetSlotNumber(ctx context.Context, slotNumber uint64) error {
	s.log.WithField("slotNumber", slotNumber).Debug("Setting slot number")
	s.result.SyncStatus.Slot = slotNumber
	return nil
}

func (s *service) SetLabels(ctx context.Context, labels map[string]string) error {
	s.log.WithField("labels", labels).Debug("Setting labels")
	s.result.Labels = labels
	return nil
}

func (s *service) SetNetwork(ctx context.Context, network string) error {
	s.log.WithField("network", network).Debug("Setting network")
	s.result.Network = network
	return nil
}

func (s *service) AddSyncProgressEntry(ctx context.Context, entry SyncProgressEntry) error {
	s.log.WithField("entry", entry).Debug("Adding sync progress entry")
	s.result.SyncStatus.SyncProgress = append(s.result.SyncStatus.SyncProgress, entry)
	return nil
}

func (s *service) SetExecutionClientInfo(ctx context.Context, info *ClientInfo) error {
	s.log.WithField("info", info).Debug("Setting execution client info")

	if info.Name != "" {
		s.result.ExecutionClientInfo.Name = info.Name
	}
	if info.Type != "" {
		s.result.ExecutionClientInfo.Type = info.Type
	}
	if info.Image != "" {
		s.result.ExecutionClientInfo.Image = info.Image
	}
	if len(info.Entrypoint) > 0 {
		s.result.ExecutionClientInfo.Entrypoint = info.Entrypoint
	}
	if len(info.Cmd) > 0 {
		s.result.ExecutionClientInfo.Cmd = info.Cmd
	}
	if info.Version != "" {
		s.result.ExecutionClientInfo.Version = info.Version
	}

	return nil
}

func (s *service) SetConsensusClientInfo(ctx context.Context, info *ClientInfo) error {
	s.log.WithField("info", info).Debug("Setting consensus client info")

	if info.Name != "" {
		s.result.ConsensusClientInfo.Name = info.Name
	}
	if info.Type != "" {
		s.result.ConsensusClientInfo.Type = info.Type
	}
	if info.Image != "" {
		s.result.ConsensusClientInfo.Image = info.Image
	}
	if len(info.Entrypoint) > 0 {
		s.result.ConsensusClientInfo.Entrypoint = info.Entrypoint
	}
	if len(info.Cmd) > 0 {
		s.result.ConsensusClientInfo.Cmd = info.Cmd
	}
	if info.Version != "" {
		s.result.ConsensusClientInfo.Version = info.Version
	}

	return nil
}

// GenerateReport generates a report from the sync test results
func (s *service) SaveReportToFiles(ctx context.Context, baseFilename string, dir string) error {

	fullFilePrefix := fmt.Sprintf("%s-%s", s.result.RunID, baseFilename)
	mainFilePath := filepath.Join(dir, fullFilePrefix+".main.json")
	progressFilePath := filepath.Join(dir, fullFilePrefix+".progress.json")

	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create report directory: %w", err)
	}

	// Save sync progress to separate file
	progressData, err := json.MarshalIndent(s.result.SyncStatus.SyncProgress, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal sync progress: %w", err)
	}

	if err := os.WriteFile(progressFilePath, progressData, 0644); err != nil {
		return fmt.Errorf("failed to write progress file: %w", err)
	}

	// Create a copy of the report for the main file (without sync progress data)
	mainReport := *s.result
	mainReport.SyncStatus.SyncProgressFile = fullFilePrefix + ".progress.json"
	mainReport.SyncStatus.SyncProgress = nil // Remove the sync progress data from main report

	jsonData, err := json.MarshalIndent(&mainReport, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to export report as JSON: %w", err)
	}

	if err := os.WriteFile(mainFilePath, jsonData, 0644); err != nil {
		return fmt.Errorf("failed to write report to file: %w", err)
	}

	s.log.WithField("filename", baseFilename).Info("Report generated successfully")

	return nil
}

// Index types and functions

// IndexEntry represents a single entry in the index
type IndexEntry struct {
	RunID               string            `json:"run_id"`
	Timestamp           int64             `json:"timestamp"`
	Network             string            `json:"network"`
	Labels              map[string]string `json:"labels,omitempty"`
	ExecutionClientInfo IndexClientInfo   `json:"execution_client_info"`
	ConsensusClientInfo IndexClientInfo   `json:"consensus_client_info"`
	SyncInfo            IndexSyncInfo     `json:"sync_info"`
	MainFile            string            `json:"main_file"`
	ProgressFile        string            `json:"progress_file"`
}

// IndexClientInfo represents client information in the index
type IndexClientInfo struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Image   string `json:"image"`
	Version string `json:"version"`
}

// IndexSyncInfo represents sync information in the index
type IndexSyncInfo struct {
	Start        int64  `json:"start"`
	End          int64  `json:"end"`
	Duration     int64  `json:"duration"`
	Block        uint64 `json:"block"`
	Slot         uint64 `json:"slot"`
	EntriesCount int    `json:"entries_count"`
}

// Index represents the complete index structure
type Index struct {
	Generated int64        `json:"generated"`
	Entries   []IndexEntry `json:"entries"`
}

// IndexService defines the interface for index operations
type IndexService interface {
	GenerateIndex(ctx context.Context, reportDir string) (*Index, error)
	SaveIndex(ctx context.Context, index *Index, outputPath string) error
}

// indexService implements the IndexService interface
type indexService struct {
	log logrus.FieldLogger
}

// NewIndexService creates a new index service
func NewIndexService(log logrus.FieldLogger) IndexService {
	return &indexService{
		log: log.WithField("package", "report-index"),
	}
}

// GenerateIndex scans the report directory and generates an index
func (s *indexService) GenerateIndex(ctx context.Context, reportDir string) (*Index, error) {
	s.log.WithField("reportDir", reportDir).Debug("Generating index")

	index := &Index{
		Generated: time.Now().Unix(),
		Entries:   make([]IndexEntry, 0),
	}

	// Find all main report files
	mainFiles, err := s.findMainReportFiles(reportDir)
	if err != nil {
		return nil, fmt.Errorf("failed to find main report files: %w", err)
	}

	// Process each main file
	for _, mainFile := range mainFiles {
		entry, err := s.processMainFile(mainFile, reportDir)
		if err != nil {
			s.log.WithField("file", mainFile).WithError(err).Warn("Failed to process main file")
			continue
		}
		index.Entries = append(index.Entries, *entry)
	}

	s.log.WithField("entriesCount", len(index.Entries)).Info("Index generated successfully")
	return index, nil
}

// SaveIndex saves the index to a file
func (s *indexService) SaveIndex(ctx context.Context, index *Index, outputPath string) error {
	s.log.WithField("outputPath", outputPath).Debug("Saving index")

	// Create directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Marshal index to JSON
	data, err := json.MarshalIndent(index, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal index: %w", err)
	}

	// Write to file
	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write index file: %w", err)
	}

	s.log.WithField("outputPath", outputPath).Info("Index saved successfully")
	return nil
}

// findMainReportFiles finds all main report files in the directory
func (s *indexService) findMainReportFiles(reportDir string) ([]string, error) {
	pattern := filepath.Join(reportDir, "*.main.json")
	files, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to glob files: %w", err)
	}
	return files, nil
}

// processMainFile processes a main report file and extracts index information
func (s *indexService) processMainFile(mainFilePath, reportDir string) (*IndexEntry, error) {
	// Read the main file
	data, err := os.ReadFile(mainFilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read main file: %w", err)
	}

	// Parse the JSON
	var result Result
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal main file: %w", err)
	}

	// Calculate sync duration
	duration := int64(0)
	if result.SyncStatus.End > 0 && result.SyncStatus.Start > 0 {
		duration = result.SyncStatus.End - result.SyncStatus.Start
	}

	// Count progress entries
	entriesCount := 0
	if result.SyncStatus.SyncProgressFile != "" {
		progressFilePath := filepath.Join(reportDir, result.SyncStatus.SyncProgressFile)
		entriesCount = s.countProgressEntries(progressFilePath)
	}

	// Create index entry
	entry := &IndexEntry{
		RunID:     result.RunID,
		Timestamp: result.Timestamp,
		Network:   result.Network,
		Labels:    result.Labels,
		ExecutionClientInfo: IndexClientInfo{
			Name:    result.ExecutionClientInfo.Name,
			Type:    result.ExecutionClientInfo.Type,
			Image:   result.ExecutionClientInfo.Image,
			Version: result.ExecutionClientInfo.Version,
		},
		ConsensusClientInfo: IndexClientInfo{
			Name:    result.ConsensusClientInfo.Name,
			Type:    result.ConsensusClientInfo.Type,
			Image:   result.ConsensusClientInfo.Image,
			Version: result.ConsensusClientInfo.Version,
		},
		SyncInfo: IndexSyncInfo{
			Start:        result.SyncStatus.Start,
			End:          result.SyncStatus.End,
			Duration:     duration,
			Block:        result.SyncStatus.Block,
			Slot:         result.SyncStatus.Slot,
			EntriesCount: entriesCount,
		},
		MainFile:     filepath.Base(mainFilePath),
		ProgressFile: result.SyncStatus.SyncProgressFile,
	}

	return entry, nil
}

// countProgressEntries counts the number of entries in a progress file
func (s *indexService) countProgressEntries(progressFilePath string) int {
	data, err := os.ReadFile(progressFilePath)
	if err != nil {
		s.log.WithField("file", progressFilePath).WithError(err).Debug("Failed to read progress file")
		return 0
	}

	var entries []SyncProgressEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		s.log.WithField("file", progressFilePath).WithError(err).Debug("Failed to unmarshal progress file")
		return 0
	}

	return len(entries)
}

// Interface compliance check
var _ Service = (*service)(nil)
var _ IndexService = (*indexService)(nil)
