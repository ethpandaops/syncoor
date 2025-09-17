package metrics_exporter

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	io_prometheus_client "github.com/prometheus/client_model/go"
	"github.com/prometheus/common/expfmt"
	"github.com/sirupsen/logrus"
)

// Static errors for better error handling
var (
	ErrExternalMetricsExporterNotRunning = errors.New("external metrics exporter is not running")
	ErrMetricsEndpointStatusCode         = errors.New("metrics endpoint returned non-200 status code")
	ErrFailedToFetchMetrics              = errors.New("failed to fetch metrics")
	ErrFailedToReadResponseBody          = errors.New("failed to read response body")
)

type Client interface {
	FetchMetrics(ctx context.Context) (*ParsedMetrics, error)
}

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
type client struct {
	log        logrus.FieldLogger
	httpClient *http.Client
	endpoint   string

	// External endpoint support
	isExternal      bool
	externalManager *ExternalManager
}

// NewClient creates a new metrics export client for internal endpoints
func NewClient(log logrus.FieldLogger, endpoint string) Client {
	return &client{
		log:      log.WithField("package", "metrics-exporter"),
		endpoint: endpoint,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		isExternal: false,
	}
}

// NewExternalClient creates a new metrics export client for external endpoints
func NewExternalClient(externalManager *ExternalManager, logger logrus.FieldLogger) Client {
	return &client{
		log: logger.WithField("package", "metrics-exporter-external"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		isExternal:      true,
		externalManager: externalManager,
	}
}

// FetchMetrics fetches and parses metrics from either internal or external endpoint
func (c *client) FetchMetrics(ctx context.Context) (*ParsedMetrics, error) {
	var metricsURL string

	if c.isExternal {
		if !c.externalManager.IsRunning(ctx) {
			return nil, fmt.Errorf("%w", ErrExternalMetricsExporterNotRunning)
		}
		metricsURL = c.externalManager.GetMetricsEndpoint()
		c.log.WithField("external_endpoint", metricsURL).Debug("Fetching metrics from external exporter")
	} else {
		metricsURL = c.endpoint
		c.log.WithField("internal_endpoint", metricsURL).Debug("Fetching metrics from internal exporter")
	}

	// Create request with context
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, metricsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrFailedToFetchMetrics, err.Error())
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w from %s: %s", ErrFailedToFetchMetrics, metricsURL, err.Error())
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: %s returned status %d", ErrMetricsEndpointStatusCode, metricsURL, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w from %s: %s", ErrFailedToReadResponseBody, metricsURL, err.Error())
	}

	return c.parseMetrics(strings.NewReader(string(body)))
}

// parseMetrics parses the Prometheus-style metrics using official libraries
func (c *client) parseMetrics(reader io.Reader) (*ParsedMetrics, error) {
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
	if family, exists := metricFamilies["eth_docker_volume_usage_bytes"]; exists {
		c.parseDiskUsageFamily(family, parsed)
	}

	// Parse consensus peers
	if family, exists := metricFamilies["eth_con_peers"]; exists {
		c.parseConPeersFamily(family, parsed)
	}

	// Parse execution net peer count
	if family, exists := metricFamilies["eth_exe_net_peer_count"]; exists {
		c.parseExePeersFamily(family, parsed)
	}

	// Parse execution client version
	if family, exists := metricFamilies["eth_exe_web3_client_version"]; exists {
		c.parseExeVersionFamily(family, parsed)
	}

	// Parse consensus node version
	if family, exists := metricFamilies["eth_con_node_version"]; exists {
		c.parseConVersionFamily(family, parsed)
	}

	// Parse execution chain ID
	if family, exists := metricFamilies["eth_exe_chain_id"]; exists {
		c.parseExeChainIDFamily(family, parsed)
	}

	// Parse execution sync current block
	if family, exists := metricFamilies["eth_exe_sync_current_block"]; exists {
		c.parseExeSyncCurrentBlockFamily(family, parsed)
	}

	// Parse execution sync highest block
	if family, exists := metricFamilies["eth_exe_sync_highest_block"]; exists {
		c.parseExeSyncHighestBlockFamily(family, parsed)
	}

	// Parse execution sync is syncing
	if family, exists := metricFamilies["eth_exe_sync_is_syncing"]; exists {
		c.parseExeSyncIsSyncingFamily(family, parsed)
	}

	// Parse execution sync percentage
	if family, exists := metricFamilies["eth_exe_sync_percentage"]; exists {
		c.parseExeSyncPercentageFamily(family, parsed)
	}

	// Parse consensus sync head slot
	if family, exists := metricFamilies["eth_con_sync_head_slot"]; exists {
		c.parseConSyncHeadSlotFamily(family, parsed)
	}

	// Parse consensus sync estimated highest slot
	if family, exists := metricFamilies["eth_con_sync_estimated_highest_slot"]; exists {
		c.parseConSyncEstimatedHighestSlotFamily(family, parsed)
	}

	// Parse consensus sync is syncing
	if family, exists := metricFamilies["eth_con_sync_is_syncing"]; exists {
		c.parseConSyncIsSyncingFamily(family, parsed)
	}

	// Parse consensus sync percentage
	if family, exists := metricFamilies["eth_con_sync_percentage"]; exists {
		c.parseConSyncPercentageFamily(family, parsed)
	}

	return parsed, nil
}

// parseDiskUsageFamily parses eth_docker_volume_usage_bytes metrics
func (c *client) parseDiskUsageFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		var clientType string
		for _, label := range metric.GetLabel() {
			if label.GetName() == "type" {
				clientType = label.GetValue()
				break
			}
		}

		if metric.GetGauge() != nil {
			switch clientType {
			case "consensus":
				parsed.ConDiskUsage += uint64(metric.GetGauge().GetValue())
			case "execution":
				parsed.ExeDiskUsage += uint64(metric.GetGauge().GetValue())
			}
		}
	}
}

// parseConPeersFamily parses eth_con_peers metrics
func (c *client) parseConPeersFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
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
func (c *client) parseExePeersFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExePeers = uint64(metric.GetGauge().GetValue())
			break // Only need the first one
		}
	}
}

// parseExeVersionFamily parses eth_exe_web3_client_version metrics
func (c *client) parseExeVersionFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	parsed.ExeVersion = c.extractVersionFromFamily(family)
}

// parseConVersionFamily parses eth_con_node_version metrics
func (c *client) parseConVersionFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	parsed.ConVersion = c.extractVersionFromFamily(family)
}

// extractVersionFromFamily extracts the version string from a metric family's version label
func (c *client) extractVersionFromFamily(family *io_prometheus_client.MetricFamily) string {
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
func (c *client) parseExeChainIDFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExeChainID = uint64(metric.GetGauge().GetValue())
			break
		}
	}
}

// parseExeSyncCurrentBlockFamily parses eth_exe_sync_current_block metrics
func (c *client) parseExeSyncCurrentBlockFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExeSyncCurrentBlock = uint64(metric.GetGauge().GetValue())
			break
		}
	}
}

// parseExeSyncHighestBlockFamily parses eth_exe_sync_highest_block metrics
func (c *client) parseExeSyncHighestBlockFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExeSyncHighestBlock = uint64(metric.GetGauge().GetValue())
			break
		}
	}
}

// parseExeSyncIsSyncingFamily parses eth_exe_sync_is_syncing metrics
func (c *client) parseExeSyncIsSyncingFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ExeIsSyncing = metric.GetGauge().GetValue() == 1
			break
		}
	}
}

// parseExeSyncPercentageFamily parses eth_exe_sync_percentage metrics
func (c *client) parseExeSyncPercentageFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			value := metric.GetGauge().GetValue()
			if math.IsNaN(value) || math.IsInf(value, 0) {
				parsed.ExeSyncPercentage = 0.0
			} else {
				parsed.ExeSyncPercentage = value
			}
			break
		}
	}
}

// parseConSyncHeadSlotFamily parses eth_con_sync_head_slot metrics
func (c *client) parseConSyncHeadSlotFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ConSyncHeadSlot = uint64(metric.GetGauge().GetValue())
			break
		}
	}
}

// parseConSyncEstimatedHighestSlotFamily parses eth_con_sync_estimated_highest_slot metrics
func (c *client) parseConSyncEstimatedHighestSlotFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ConSyncEstimatedHighestSlot = uint64(metric.GetGauge().GetValue())
			break
		}
	}
}

// parseConSyncIsSyncingFamily parses eth_con_sync_is_syncing metrics
func (c *client) parseConSyncIsSyncingFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			parsed.ConIsSyncing = metric.GetGauge().GetValue() == 1
			break
		}
	}
}

// parseConSyncPercentageFamily parses eth_con_sync_percentage metrics
func (c *client) parseConSyncPercentageFamily(family *io_prometheus_client.MetricFamily, parsed *ParsedMetrics) {
	for _, metric := range family.GetMetric() {
		if metric.GetGauge() != nil {
			value := metric.GetGauge().GetValue()
			if math.IsNaN(value) || math.IsInf(value, 0) {
				parsed.ConSyncPercentage = 0.0
			} else {
				parsed.ConSyncPercentage = value
			}
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
