package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

// ErrInvalidFilePath is returned when an invalid file path is provided
var ErrInvalidFilePath = errors.New("invalid input file path")

// ReportToMdCommand creates the report-to-md command
func NewReportToMdCommand() *cobra.Command {
	var (
		inputFile  string
		outputFile string
	)

	cmd := &cobra.Command{
		Use:   "report-to-md",
		Short: "Convert a JSON report to markdown summary",
		Long:  "Converts a syncoor main report JSON file to a human-readable markdown summary",
		Run: func(cmd *cobra.Command, args []string) {
			if err := convertReportToMarkdown(inputFile, outputFile); err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}
		},
	}

	cmd.Flags().StringVar(&inputFile, "input", "", "Input JSON report file (required)")
	cmd.Flags().StringVar(&outputFile, "output", "", "Output markdown file (optional, defaults to input file with .md extension)")
	if err := cmd.MarkFlagRequired("input"); err != nil {
		panic(fmt.Sprintf("failed to mark input flag as required: %v", err))
	}

	return cmd
}

// MainReport represents the structure of a syncoor main report
type MainReport struct {
	RunID      string `json:"run_id"`
	Timestamp  int64  `json:"timestamp"`
	Network    string `json:"network"`
	SyncStatus struct {
		Start            int64  `json:"start"`
		End              int64  `json:"end"`
		Status           string `json:"status"`
		StatusMessage    string `json:"status_message,omitempty"`
		Block            uint64 `json:"block"`
		Slot             uint64 `json:"slot"`
		SyncProgressFile string `json:"sync_progress_file"`
		EntriesCount     int    `json:"entries_count"`
		LastEntry        *struct {
			T  int64  `json:"t"`
			B  uint64 `json:"b"`
			S  uint64 `json:"s"`
			DE uint64 `json:"de"`
			DC uint64 `json:"dc"`
			PE uint64 `json:"pe"`
			PC uint64 `json:"pc"`
		} `json:"last_entry,omitempty"`
	} `json:"sync_status"`
	ExecutionClientInfo struct {
		Name       string   `json:"name"`
		Type       string   `json:"type"`
		Image      string   `json:"image"`
		Version    string   `json:"version"`
		Entrypoint []string `json:"entrypoint,omitempty"`
		Cmd        []string `json:"cmd,omitempty"`
	} `json:"execution_client_info"`
	ConsensusClientInfo struct {
		Name       string   `json:"name"`
		Type       string   `json:"type"`
		Image      string   `json:"image"`
		Version    string   `json:"version"`
		Entrypoint []string `json:"entrypoint,omitempty"`
		Cmd        []string `json:"cmd,omitempty"`
	} `json:"consensus_client_info"`
	SystemInfo *SystemInfoStruct `json:"system_info,omitempty"`
	Labels     map[string]string `json:"labels,omitempty"`
}

func convertReportToMarkdown(inputFile, outputFile string) error {
	// Validate input file path to prevent directory traversal
	cleanInput := filepath.Clean(inputFile)
	if strings.Contains(cleanInput, "..") {
		return ErrInvalidFilePath
	}

	// Read the input JSON file
	data, err := os.ReadFile(cleanInput)
	if err != nil {
		return fmt.Errorf("failed to read input file: %w", err)
	}

	// Parse the JSON
	var report MainReport
	if err := json.Unmarshal(data, &report); err != nil {
		return fmt.Errorf("failed to parse JSON: %w", err)
	}

	// Determine output file path
	if outputFile == "" {
		ext := filepath.Ext(cleanInput)
		outputFile = strings.TrimSuffix(cleanInput, ext) + ".md"
	}

	// Generate markdown content
	markdown := generateMarkdownSummary(&report, cleanInput)

	// Write the markdown file
	if err := os.WriteFile(outputFile, []byte(markdown), 0o644); err != nil { //nolint: gosec // Open read permissions are OK for the report
		return fmt.Errorf("failed to write output file: %w", err)
	}

	fmt.Printf("✅ Successfully converted %s to %s\n", cleanInput, outputFile)
	return nil
}

func generateMarkdownSummary(report *MainReport, inputFile string) string {
	var md strings.Builder
	titleCaser := cases.Title(language.English)

	// Header
	md.WriteString(fmt.Sprintf("# Syncoor Test Report: %s-%s-%s\n\n",
		strings.ToLower(report.Network),
		strings.ToLower(report.ExecutionClientInfo.Type),
		strings.ToLower(report.ConsensusClientInfo.Type)))

	// Status Information (prominently at the top)
	addStatusInfo(&md, report)

	// Basic Information
	addBasicInfo(&md, report, titleCaser)

	// Timeline
	addTimelineInfo(&md, report)

	// Client Information
	addClientInfo(&md, report, titleCaser)

	// Sync Results
	addSyncResults(&md, report)

	// System Information
	if report.SystemInfo != nil {
		addSystemInfo(&md, report.SystemInfo)
	}

	// Labels (if any)
	if len(report.Labels) > 0 {
		addLabelsInfo(&md, report.Labels)
	}

	// YAML Configuration
	addYAMLConfigInfo(&md, report)

	// Files
	addFilesInfo(&md, report, inputFile)

	return md.String()
}

func addStatusInfo(md *strings.Builder, report *MainReport) {
	md.WriteString("## 🚦 Sync Status\n\n")
	md.WriteString("| Field | Value |\n")
	md.WriteString("|-------|-------|\n")

	// Add sync status
	if report.SyncStatus.Status != "" {
		statusIcon := "✅"
		if report.SyncStatus.Status == "timeout" {
			statusIcon = "⏰"
		} else if report.SyncStatus.Status != "success" {
			statusIcon = "❌"
		}
		fmt.Fprintf(md, "| **Status** | %s %s |\n", statusIcon, strings.Title(report.SyncStatus.Status))
	}

	// Add status message if available
	if report.SyncStatus.StatusMessage != "" {
		fmt.Fprintf(md, "| **Message** | %s |\n", report.SyncStatus.StatusMessage)
	}

	// Calculate and add duration
	duration := time.Duration(report.SyncStatus.End-report.SyncStatus.Start) * time.Second
	fmt.Fprintf(md, "| **Duration** | %s |\n", formatDuration(duration))

	md.WriteString("\n")
}

func addBasicInfo(md *strings.Builder, report *MainReport, titleCaser cases.Caser) {
	md.WriteString("## 📋 Test Information\n\n")
	md.WriteString("| Field | Value |\n")
	md.WriteString("|-------|-------|\n")
	md.WriteString("| **Run ID** | `" + report.RunID + "` |\n")
	md.WriteString("| **Network** | " + titleCaser.String(report.Network) + " |\n")
	md.WriteString("| **Test Date** | " + time.Unix(report.Timestamp, 0).Format("2006-01-02 15:04:05 UTC") + " |\n")
	fmt.Fprintf(md, "| **Progress Entries** | %d data points |\n", report.SyncStatus.EntriesCount)
	md.WriteString("\n")
}

func addSyncResults(md *strings.Builder, report *MainReport) {
	md.WriteString("## 🎯 Sync Results\n\n")
	md.WriteString("| Field | Value |\n")
	md.WriteString("|-------|-------|\n")
	fmt.Fprintf(md, "| **Final Block** | %s |\n", formatNumber(report.SyncStatus.Block))
	fmt.Fprintf(md, "| **Final Slot** | %s |\n", formatNumber(report.SyncStatus.Slot))

	if report.SyncStatus.LastEntry != nil {
		fmt.Fprintf(md, "| **EL Disk Usage** | %s |\n", formatBytes(report.SyncStatus.LastEntry.DE))
		fmt.Fprintf(md, "| **CL Disk Usage** | %s |\n", formatBytes(report.SyncStatus.LastEntry.DC))
		fmt.Fprintf(md, "| **EL Peers** | %d |\n", report.SyncStatus.LastEntry.PE)
		fmt.Fprintf(md, "| **CL Peers** | %d |\n", report.SyncStatus.LastEntry.PC)
	}
	md.WriteString("\n")
}

func addClientInfo(md *strings.Builder, report *MainReport, titleCaser cases.Caser) {
	md.WriteString("## 🔧 Client Configuration\n\n")

	md.WriteString("| Field | Execution Layer | Consensus Layer |\n")
	md.WriteString("|-------|------------------|------------------|\n")
	elClient := titleCaser.String(report.ExecutionClientInfo.Type) + " (" + report.ExecutionClientInfo.Name + ")"
	clClient := titleCaser.String(report.ConsensusClientInfo.Type) + " (" + report.ConsensusClientInfo.Name + ")"
	md.WriteString("| **Client** | " + elClient + " | " + clClient + " |\n")
	md.WriteString("| **Image** | `" + report.ExecutionClientInfo.Image + "` | `" + report.ConsensusClientInfo.Image + "` |\n")

	// Handle version row - both clients should have versions, but check anyway
	elVersion := report.ExecutionClientInfo.Version
	clVersion := report.ConsensusClientInfo.Version
	if elVersion == "" {
		elVersion = "N/A"
	}
	if clVersion == "" {
		clVersion = "N/A"
	}
	md.WriteString("| **Version** | " + elVersion + " | " + clVersion + " |\n")
	md.WriteString("\n")
}

type SystemInfoStruct struct {
	Hostname       string `json:"hostname"`
	GoVersion      string `json:"go_version"`
	SyncoorVersion string `json:"syncoor_version,omitempty"`
	OSArchitecture string `json:"os_architecture,omitempty"`
	OSName         string `json:"os_name,omitempty"`
	OSVendor       string `json:"os_vendor,omitempty"`
	OSVersion      string `json:"os_version,omitempty"`
	KernelVersion  string `json:"kernel_version,omitempty"`
	CPUModel       string `json:"cpu_model,omitempty"`
	CPUVendor      string `json:"cpu_vendor,omitempty"`
	CPUCores       int    `json:"cpu_cores,omitempty"`
	CPUThreads     int    `json:"cpu_threads,omitempty"`
	CPUSpeed       int    `json:"cpu_speed,omitempty"`
	TotalMemory    uint64 `json:"total_memory"`
	MemoryType     string `json:"memory_type,omitempty"`
	MemorySpeed    int    `json:"memory_speed,omitempty"`
	Hypervisor     string `json:"hypervisor,omitempty"`
	Timezone       string `json:"timezone,omitempty"`
}

func addSystemInfo(md *strings.Builder, systemInfo *SystemInfoStruct) {
	md.WriteString("## 💻 System Information\n\n")
	md.WriteString("| Field | Value |\n")
	md.WriteString("|-------|-------|\n")
	md.WriteString("| **Hostname** | " + systemInfo.Hostname + " |\n")

	addOSInfoTable(md, systemInfo)
	addCPUInfoTable(md, systemInfo)
	addMemoryInfoTable(md, systemInfo)
	addVersionInfoTable(md, systemInfo)

	if systemInfo.Hypervisor != "" {
		md.WriteString("| **Hypervisor** | " + systemInfo.Hypervisor + " |\n")
	}

	md.WriteString("\n")
}

func addOSInfoTable(md *strings.Builder, systemInfo *SystemInfoStruct) {
	if systemInfo.OSName != "" {
		osStr := systemInfo.OSName
		if systemInfo.OSVersion != "" {
			osStr += " " + systemInfo.OSVersion
		}
		if systemInfo.OSArchitecture != "" {
			osStr += " (" + systemInfo.OSArchitecture + ")"
		}
		md.WriteString("| **Operating System** | " + osStr + " |\n")
	}
}

func addCPUInfoTable(md *strings.Builder, systemInfo *SystemInfoStruct) {
	if systemInfo.CPUModel != "" {
		cpuStr := systemInfo.CPUModel
		if systemInfo.CPUCores > 0 {
			cpuStr += fmt.Sprintf(" (%d cores", systemInfo.CPUCores)
			if systemInfo.CPUThreads > 0 && systemInfo.CPUThreads != systemInfo.CPUCores {
				cpuStr += fmt.Sprintf("/%d threads", systemInfo.CPUThreads)
			}
			cpuStr += ")"
		}
		md.WriteString("| **CPU** | " + cpuStr + " |\n")
	}
}

func addMemoryInfoTable(md *strings.Builder, systemInfo *SystemInfoStruct) {
	if systemInfo.TotalMemory > 0 {
		memStr := formatBytes(systemInfo.TotalMemory)
		if systemInfo.MemoryType != "" {
			memStr += " (" + systemInfo.MemoryType
			if systemInfo.MemorySpeed > 0 {
				memStr += fmt.Sprintf(" @ %d MT/s", systemInfo.MemorySpeed)
			}
			memStr += ")"
		}
		md.WriteString("| **Memory** | " + memStr + " |\n")
	}
}

func addVersionInfoTable(md *strings.Builder, systemInfo *SystemInfoStruct) {
	if systemInfo.GoVersion != "" {
		md.WriteString("| **Go Version** | " + systemInfo.GoVersion + " |\n")
	}

	if systemInfo.SyncoorVersion != "" {
		md.WriteString("| **Syncoor Version** | " + systemInfo.SyncoorVersion + " |\n")
	}
}

func addLabelsInfo(md *strings.Builder, labels map[string]string) {
	md.WriteString("## 🏷️ Labels\n\n")

	// Check for GitHub Actions labels
	var githubLabels []map[string]string
	var otherLabels []map[string]string

	for key, value := range labels {
		if strings.HasPrefix(key, "github.") {
			githubLabels = append(githubLabels, map[string]string{
				"key":   strings.TrimPrefix(key, "github."),
				"value": value,
			})
		} else {
			otherLabels = append(otherLabels, map[string]string{
				"key":   key,
				"value": value,
			})
		}
	}

	if len(githubLabels) > 0 {
		md.WriteString("### GitHub Actions\n\n")
		md.WriteString("| Field | Value |\n")
		md.WriteString("|-------|-------|\n")
		for _, label := range githubLabels {
			md.WriteString("| **" + label["key"] + "** | " + label["value"] + " |\n")
		}
		md.WriteString("\n")
	}

	if len(otherLabels) > 0 {
		md.WriteString("### Other Labels\n\n")
		md.WriteString("| Field | Value |\n")
		md.WriteString("|-------|-------|\n")
		for _, label := range otherLabels {
			md.WriteString("| **" + label["key"] + "** | " + label["value"] + " |\n")
		}
		md.WriteString("\n")
	}
}

func addTimelineInfo(md *strings.Builder, report *MainReport) {
	duration := time.Duration(report.SyncStatus.End-report.SyncStatus.Start) * time.Second
	md.WriteString("## ⏱️ Timeline\n\n")
	md.WriteString("| Field | Value |\n")
	md.WriteString("|-------|-------|\n")
	fmt.Fprintf(md, "| **Start Time** | %s |\n", time.Unix(report.SyncStatus.Start, 0).Format("2006-01-02 15:04:05 UTC"))
	fmt.Fprintf(md, "| **End Time** | %s |\n", time.Unix(report.SyncStatus.End, 0).Format("2006-01-02 15:04:05 UTC"))
	fmt.Fprintf(md, "| **Total Duration** | %s |\n", formatDuration(duration))
	md.WriteString("\n")
}

func addYAMLConfigInfo(md *strings.Builder, report *MainReport) {
	md.WriteString("## ⚙️ YAML Configuration\n\n")
	md.WriteString("```yaml\n")
	fmt.Fprintf(md, "participants:\n")
	fmt.Fprintf(md, "  - el_type: %s\n", strings.ToLower(report.ExecutionClientInfo.Type))
	fmt.Fprintf(md, "    el_image: %s\n", report.ExecutionClientInfo.Image)
	fmt.Fprintf(md, "    cl_type: %s\n", strings.ToLower(report.ConsensusClientInfo.Type))
	fmt.Fprintf(md, "    cl_image: %s\n", report.ConsensusClientInfo.Image)
	fmt.Fprintf(md, "    validator_count: 0\n")
	fmt.Fprintf(md, "network_params:\n")
	fmt.Fprintf(md, "  network: \"%s\"\n", report.Network)
	fmt.Fprintf(md, "persistent: true\n")
	fmt.Fprintf(md, "ethereum_metrics_exporter_enabled: true\n")
	md.WriteString("```\n\n")
}

func addFilesInfo(md *strings.Builder, report *MainReport, inputFile string) {
	md.WriteString("## 📁 Related Files\n\n")
	md.WriteString("| Field | Value |\n")
	md.WriteString("|-------|-------|\n")
	fmt.Fprintf(md, "| **Main Data** | `%s` |\n", filepath.Base(inputFile))
	if report.SyncStatus.SyncProgressFile != "" {
		fmt.Fprintf(md, "| **Progress Data** | `%s` |\n", report.SyncStatus.SyncProgressFile)
	}
	md.WriteString("\n")
}

// Helper functions for formatting
func formatDuration(d time.Duration) string {
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%.1fs", d.Seconds())
	case d < time.Hour:
		return fmt.Sprintf("%.1fm", d.Minutes())
	default:
		return fmt.Sprintf("%.1fh", d.Hours())
	}
}

func formatBytes(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

func formatNumber(n uint64) string {
	str := strconv.FormatUint(n, 10)
	if len(str) <= 3 {
		return str
	}

	var result strings.Builder
	for i, r := range str {
		if i > 0 && (len(str)-i)%3 == 0 {
			result.WriteRune(',')
		}
		result.WriteRune(r)
	}
	return result.String()
}
