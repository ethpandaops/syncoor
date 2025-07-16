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
	ConDiskUsage uint64
	ExeDiskUsage uint64
	ConPeers     uint64
	ExePeers     uint64
	ExeVersion   string
	ConVersion   string
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
