package main

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	io_prometheus_client "github.com/prometheus/client_model/go"
	"github.com/prometheus/common/expfmt"
)

// ParsedMetrics contains the parsed metrics we're interested in
type ParsedMetrics struct {

	// Execution
	ExeVersion          string
	ExePeers            uint64
	ExeDiskUsage        uint64
	ExeChainID          uint64
	ExeSyncCurrentBlock uint64
	ExeSyncHighestBlock uint64
	ExeIsSyncing        bool
	ExeSyncPercentage   float64

	// Consensus
	ConVersion                  string
	ConPeers                    uint64
	ConDiskUsage                uint64
	ConSyncHeadSlot             uint64
	ConSyncEstimatedHighestSlot uint64
	ConIsSyncing                bool
	ConSyncPercentage           float64
}

// MetricsClient handles fetching and parsing metrics
type MetricsClient struct {
	httpClient *http.Client
}

// NewMetricsClient creates a new metrics client
func NewMetricsClient() *MetricsClient {
	return &MetricsClient{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// FetchMetrics fetches and parses metrics from the given endpoint
func (mc *MetricsClient) FetchMetrics(endpoint string) (*ParsedMetrics, error) {
	resp, err := mc.httpClient.Get(endpoint)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch metrics: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("metrics endpoint returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	return mc.parseMetrics(strings.NewReader(string(body)))
}

// parseMetrics parses the Prometheus-style metrics using official libraries
func (mc *MetricsClient) parseMetrics(reader io.Reader) (*ParsedMetrics, error) {
	parser := expfmt.TextParser{}
	metricFamilies, err := parser.TextToMetricFamilies(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to parse metrics: %w", err)
	}

	parsed := &ParsedMetrics{
		ConDiskUsage: 0,
		ExeDiskUsage: 0,
		ConPeers:     0,
		ExePeers:     0,
		ExeVersion:   "",
		ConVersion:   "",

		// Execution sync metrics
		ExeChainID:          0,
		ExeSyncCurrentBlock: 0,
		ExeSyncHighestBlock: 0,
		ExeIsSyncing:        false,
		ExeSyncPercentage:   0.0,

		// Consensus sync metrics
		ConSyncHeadSlot:             0,
		ConSyncEstimatedHighestSlot: 0,
		ConIsSyncing:                false,
		ConSyncPercentage:           0.0,
	}

	// Parse disk usage metrics
	if family, exists := metricFamilies["eth_disk_usage_bytes"]; exists {
		mc.parseDiskUsageFamily(family, parsed)
	}

	// Parse consensus peers
	if family, exists := metricFamilies["eth_con_peers"]; exists {
		mc.parseConPeersFamily(family, parsed)
	}

	// Parse execution net peer count
	if family, exists := metricFamilies["eth_exe_net_peer_count"]; exists {
		mc.parseExePeersFamily(family, parsed)
	}

	// Parse execution client version
	if family, exists := metricFamilies["eth_exe_web3_client_version"]; exists {
		mc.parseExeVersionFamily(family, parsed)
	}

	// Parse consensus node version
	if family, exists := metricFamilies["eth_con_node_version"]; exists {
		mc.parseConVersionFamily(family, parsed)
	}

	// Parse execution chain ID
	if family, exists := metricFamilies["eth_exe_chain_id"]; exists {
		mc.parseExeChainIDFamily(family, parsed)
	}

	// Parse execution sync current block
	if family, exists := metricFamilies["eth_exe_sync_current_block"]; exists {
		mc.parseExeSyncCurrentBlockFamily(family, parsed)
	}

	// Parse execution sync highest block
	if family, exists := metricFamilies["eth_exe_sync_highest_block"]; exists {
		mc.parseExeSyncHighestBlockFamily(family, parsed)
	}

	// Parse execution sync is syncing
	if family, exists := metricFamilies["eth_exe_sync_is_syncing"]; exists {
		mc.parseExeSyncIsSyncingFamily(family, parsed)
	}

	// Parse execution sync percentage
	if family, exists := metricFamilies["eth_exe_sync_percentage"]; exists {
		mc.parseExeSyncPercentageFamily(family, parsed)
	}

	// Parse consensus sync head slot
	if family, exists := metricFamilies["eth_con_sync_head_slot"]; exists {
		mc.parseConSyncHeadSlotFamily(family, parsed)
	}

	// Parse consensus sync estimated highest slot
	if family, exists := metricFamilies["eth_con_sync_estimated_highest_slot"]; exists {
		mc.parseConSyncEstimatedHighestSlotFamily(family, parsed)
	}

	// Parse consensus sync is syncing
	if family, exists := metricFamilies["eth_con_sync_is_syncing"]; exists {
		mc.parseConSyncIsSyncingFamily(family, parsed)
	}

	// Parse consensus sync percentage
	if family, exists := metricFamilies["eth_con_sync_percentage"]; exists {
		mc.parseConSyncPercentageFamily(family, parsed)
	}

	return parsed, nil
}

// parseDiskUsageFamily parses eth_disk_usage_bytes metrics
func (mc *MetricsClient) parseDiskUsageFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		var directory string
		for _, label := range metric.GetLabel() {
			if label.GetName() == "directory" {
				directory = label.GetValue()
				break
			}
		}

		if metric.GetGauge() != nil {
			switch directory {
			case "/data/consensus-db":
				parsed.ConDiskUsage = uint64(metric.GetGauge().GetValue())
			case "/data/execution-db":
				parsed.ExeDiskUsage = uint64(metric.GetGauge().GetValue())
			}
		}
	}
}

// parseConPeersFamily parses eth_con_peers metrics
func (mc *MetricsClient) parseConPeersFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		var state string
		for _, label := range metric.GetLabel() {
			if label.GetName() == "state" {
				state = label.GetValue()
				break
			}
		}

		if state == "connected" && metric.GetGauge() != nil {
			parsed.ConPeers += uint64(metric.GetGauge().GetValue())
		}
	}
}

// parseExePeersFamily parses eth_exe_net_peer_count metrics
func (mc *MetricsClient) parseExePeersFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExePeers = uint64(metric.GetGauge().GetValue())
			break // Only need the first one
		}
	}
}

// parseExeVersionFamily parses eth_exe_web3_client_version metrics
func (mc *MetricsClient) parseExeVersionFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	parsed.ExeVersion = mc.extractVersionFromFamily(family)
}

// parseConVersionFamily parses eth_con_node_version metrics
func (mc *MetricsClient) parseConVersionFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	parsed.ConVersion = mc.extractVersionFromFamily(family)
}

// extractVersionFromFamily extracts the version string from a metric family's version label
func (mc *MetricsClient) extractVersionFromFamily(family *io_prometheus_client.MetricFamily) string {
	for _, metric := range family.GetMetric() {
		for _, label := range metric.GetLabel() {
			if label.GetName() == "version" {
				return label.GetValue()
			}
		}
	}
	return ""
}

// parseExeChainIDFamily parses eth_exe_chain_id metrics
func (mc *MetricsClient) parseExeChainIDFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExeChainID = uint64(metric.GetGauge().GetValue())
			break
		}
	}
}

// parseExeSyncCurrentBlockFamily parses eth_exe_sync_current_block metrics
func (mc *MetricsClient) parseExeSyncCurrentBlockFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExeSyncCurrentBlock = uint64(metric.GetGauge().GetValue())
			break
		}
	}
}

// parseExeSyncHighestBlockFamily parses eth_exe_sync_highest_block metrics
func (mc *MetricsClient) parseExeSyncHighestBlockFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExeSyncHighestBlock = uint64(metric.GetGauge().GetValue())
			break
		}
	}
}

// parseExeSyncIsSyncingFamily parses eth_exe_sync_is_syncing metrics
func (mc *MetricsClient) parseExeSyncIsSyncingFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExeIsSyncing = metric.GetGauge().GetValue() == 1
			break
		}
	}
}

// parseExeSyncPercentageFamily parses eth_exe_sync_percentage metrics
func (mc *MetricsClient) parseExeSyncPercentageFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExeSyncPercentage = metric.GetGauge().GetValue()
			break
		}
	}
}

// parseConSyncHeadSlotFamily parses eth_con_sync_head_slot metrics
func (mc *MetricsClient) parseConSyncHeadSlotFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ConSyncHeadSlot = uint64(metric.GetGauge().GetValue())
			break
		}
	}
}

// parseConSyncEstimatedHighestSlotFamily parses eth_con_sync_estimated_highest_slot metrics
func (mc *MetricsClient) parseConSyncEstimatedHighestSlotFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ConSyncEstimatedHighestSlot = uint64(metric.GetGauge().GetValue())
			break
		}
	}
}

// parseConSyncIsSyncingFamily parses eth_con_sync_is_syncing metrics
func (mc *MetricsClient) parseConSyncIsSyncingFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ConIsSyncing = metric.GetGauge().GetValue() == 1
			break
		}
	}
}

// parseConSyncPercentageFamily parses eth_con_sync_percentage metrics
func (mc *MetricsClient) parseConSyncPercentageFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ConSyncPercentage = metric.GetGauge().GetValue()
			break
		}
	}
}

// FormatBytes formats bytes into human readable format
func FormatBytes(bytes uint64) string {
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
