package controlcenter

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/ethpandaops/syncoor/pkg/api"
	"github.com/sirupsen/logrus"
)

// InstanceCache holds cached data for a single Syncoor instance
type InstanceCache struct {
	mu          sync.RWMutex
	config      InstanceConfig
	tests       []api.TestSummary
	health      InstanceHealth
	lastFetch   time.Time
	lastSuccess time.Time
	fetchError  error
}

// Cache manages cached data from all Syncoor instances
type Cache struct {
	mu            sync.RWMutex
	log           logrus.FieldLogger
	client        *Client
	cfg           *Config
	instances     map[string]*InstanceCache
	instanceOrder []string // preserves config order
	stopCh        chan struct{}
	wg            sync.WaitGroup

	// GitHub workflow queue caching
	githubClient        *GitHubClient
	githubMu            sync.RWMutex
	githubWorkflows     map[string]*WorkflowQueueStatus // key: owner/repo/workflow_id
	githubWorkflowOrder []string                        // preserves config order
}

// NewCache creates a new cache instance
func NewCache(log logrus.FieldLogger, client *Client, cfg *Config) *Cache {
	return &Cache{
		log:             log,
		client:          client,
		cfg:             cfg,
		instances:       make(map[string]*InstanceCache),
		stopCh:          make(chan struct{}),
		githubWorkflows: make(map[string]*WorkflowQueueStatus),
	}
}

// SetGitHubClient sets the GitHub client for workflow queue fetching
func (c *Cache) SetGitHubClient(client *GitHubClient) {
	c.githubClient = client
}

// Start begins the background refresh goroutines
func (c *Cache) Start(ctx context.Context) {
	// Do initial refresh synchronously to have data ready on first request
	c.refreshAll(ctx)
	if c.githubClient != nil && len(c.cfg.GetEnabledWorkflows()) > 0 {
		c.refreshGitHubWorkflows(ctx)
	}

	// Start background refresh loops
	c.wg.Add(1)
	go c.refreshLoopBackground(ctx)

	if c.githubClient != nil && len(c.cfg.GetEnabledWorkflows()) > 0 {
		c.wg.Add(1)
		go c.refreshGitHubLoopBackground(ctx)
	}
}

// Stop stops the background refresh goroutine
func (c *Cache) Stop() {
	close(c.stopCh)
	c.wg.Wait()
}

// AddInstance adds or updates an instance in the cache
func (c *Cache) AddInstance(config InstanceConfig) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if existing, ok := c.instances[config.Name]; ok {
		existing.mu.Lock()
		existing.config = config
		existing.mu.Unlock()
		return
	}

	c.instances[config.Name] = &InstanceCache{
		config: config,
		health: InstanceHealth{
			Name:   config.Name,
			APIUrl: config.APIUrl,
			UIUrl:  config.UIUrl,
			Status: StatusUnknown,
		},
	}
	c.instanceOrder = append(c.instanceOrder, config.Name)
}

// RemoveInstance removes an instance from the cache
func (c *Cache) RemoveInstance(name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.instances, name)
}

// GetAllTests returns all cached tests from all instances
func (c *Cache) GetAllTests() []AggregatedTestSummary {
	c.mu.RLock()
	defer c.mu.RUnlock()

	allTests := []AggregatedTestSummary{}

	for _, inst := range c.instances {
		inst.mu.RLock()
		for _, test := range inst.tests {
			allTests = append(allTests, AggregatedTestSummary{
				TestSummary:    test,
				InstanceName:   inst.config.Name,
				InstanceAPIUrl: inst.config.APIUrl,
				InstanceUIUrl:  inst.config.UIUrl,
			})
		}
		inst.mu.RUnlock()
	}

	return allTests
}

// GetInstanceHealth returns the health status of all instances in config order
func (c *Cache) GetInstanceHealth() []InstanceHealth {
	c.mu.RLock()
	defer c.mu.RUnlock()

	health := []InstanceHealth{}
	for _, name := range c.instanceOrder {
		if inst, ok := c.instances[name]; ok {
			inst.mu.RLock()
			health = append(health, inst.health)
			inst.mu.RUnlock()
		}
	}

	return health
}

// GetInstanceNames returns the names of all cached instances
func (c *Cache) GetInstanceNames() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	names := make([]string, 0, len(c.instances))
	for name := range c.instances {
		names = append(names, name)
	}
	return names
}

// GetTestsForInstance returns cached tests for a specific instance
func (c *Cache) GetTestsForInstance(name string) ([]api.TestSummary, bool) {
	c.mu.RLock()
	inst, ok := c.instances[name]
	c.mu.RUnlock()

	if !ok {
		return nil, false
	}

	inst.mu.RLock()
	defer inst.mu.RUnlock()

	tests := make([]api.TestSummary, len(inst.tests))
	copy(tests, inst.tests)
	return tests, true
}

// refreshLoopBackground periodically refreshes cached data (initial refresh done in Start)
func (c *Cache) refreshLoopBackground(ctx context.Context) {
	defer c.wg.Done()

	ticker := time.NewTicker(c.cfg.Cache.RefreshInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-c.stopCh:
			return
		case <-ticker.C:
			c.refreshAll(ctx)
		}
	}
}

// refreshAll refreshes data from all instances
func (c *Cache) refreshAll(ctx context.Context) {
	c.mu.RLock()
	instances := make([]*InstanceCache, 0, len(c.instances))
	for _, inst := range c.instances {
		instances = append(instances, inst)
	}
	c.mu.RUnlock()

	// Refresh each instance concurrently
	var wg sync.WaitGroup
	for _, inst := range instances {
		wg.Add(1)
		go func(inst *InstanceCache) {
			defer wg.Done()
			c.refreshInstance(ctx, inst)
		}(inst)
	}
	wg.Wait()
}

// refreshInstance refreshes data for a single instance
func (c *Cache) refreshInstance(ctx context.Context, inst *InstanceCache) {
	inst.mu.RLock()
	config := inst.config
	inst.mu.RUnlock()

	if !config.Enabled {
		return
	}

	log := c.log.WithField("instance", config.Name)

	// Create a context with timeout
	fetchCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Fetch tests and directories concurrently
	var tests *api.TestListResponse
	var testsErr error
	var directories []DirectoryInfo

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		tests, testsErr = c.client.FetchTests(fetchCtx, config.APIUrl)
	}()

	go func() {
		defer wg.Done()
		directories = c.fetchDirectories(fetchCtx, config.UIUrl, log)
	}()

	wg.Wait()
	now := time.Now()

	inst.mu.Lock()
	defer inst.mu.Unlock()

	inst.lastFetch = now

	if testsErr != nil {
		inst.fetchError = testsErr
		log.WithError(testsErr).Warn("Failed to fetch tests from instance")

		// Check if cached data is still valid (within stale timeout)
		if time.Since(inst.lastSuccess) > c.cfg.Cache.StaleTimeout {
			inst.health.Status = StatusUnhealthy
		}
		inst.health.ErrorMessage = testsErr.Error()
		inst.health.LastCheck = now
		inst.health.Directories = directories // Still update directories even if tests fail
		return
	}

	// Success - update cache
	inst.fetchError = nil
	inst.lastSuccess = now
	inst.tests = tests.Tests

	// Trim tests if over limit
	if len(inst.tests) > c.cfg.Cache.MaxTestsPerInstance {
		inst.tests = inst.tests[:c.cfg.Cache.MaxTestsPerInstance]
	}

	// Update health
	inst.health = InstanceHealth{
		Name:        config.Name,
		APIUrl:      config.APIUrl,
		UIUrl:       config.UIUrl,
		Status:      StatusHealthy,
		ActiveTests: tests.ActiveCount,
		TotalTests:  tests.TotalCount,
		LastCheck:   now,
		LastSuccess: now,
		Directories: directories,
	}

	log.WithFields(logrus.Fields{
		"total_tests":  tests.TotalCount,
		"active_tests": tests.ActiveCount,
		"directories":  len(directories),
	}).Debug("Refreshed instance data")
}

// GetLastRefresh returns the most recent refresh time across all instances
func (c *Cache) GetLastRefresh() time.Time {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var latest time.Time
	for _, inst := range c.instances {
		inst.mu.RLock()
		if inst.lastFetch.After(latest) {
			latest = inst.lastFetch
		}
		inst.mu.RUnlock()
	}
	return latest
}

// GetStats returns aggregate statistics from the cache
func (c *Cache) GetStats() (totalTests, activeTests, healthyInstances int) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	for _, inst := range c.instances {
		inst.mu.RLock()
		totalTests += inst.health.TotalTests
		activeTests += inst.health.ActiveTests
		if inst.health.Status == StatusHealthy {
			healthyInstances++
		}
		inst.mu.RUnlock()
	}
	return
}

// refreshGitHubLoopBackground periodically refreshes GitHub workflow queue data (initial refresh done in Start)
func (c *Cache) refreshGitHubLoopBackground(ctx context.Context) {
	defer c.wg.Done()

	ticker := time.NewTicker(c.cfg.GitHub.RefreshInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-c.stopCh:
			return
		case <-ticker.C:
			c.refreshGitHubWorkflows(ctx)
		}
	}
}

// refreshGitHubWorkflows fetches queue status for all configured workflows
func (c *Cache) refreshGitHubWorkflows(ctx context.Context) {
	if c.githubClient == nil {
		return
	}

	workflows := c.cfg.GetEnabledWorkflows()
	if len(workflows) == 0 {
		return
	}

	c.log.WithField("workflow_count", len(workflows)).Debug("Refreshing GitHub workflow queues")

	// Fetch each workflow concurrently
	var wg sync.WaitGroup
	results := make(chan *WorkflowQueueStatus, len(workflows))

	for _, wfCfg := range workflows {
		wg.Add(1)
		go func(cfg WorkflowConfig) {
			defer wg.Done()

			fetchCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()

			status, err := c.githubClient.FetchWorkflowQueue(fetchCtx, cfg)
			if err != nil {
				c.log.WithError(err).WithFields(logrus.Fields{
					"workflow": cfg.Name,
					"owner":    cfg.Owner,
					"repo":     cfg.Repo,
				}).Warn("Failed to fetch GitHub workflow queue")
				// Return status with error set
				status = &WorkflowQueueStatus{
					Name:        cfg.Name,
					Owner:       cfg.Owner,
					Repo:        cfg.Repo,
					WorkflowID:  cfg.WorkflowID,
					WorkflowURL: "https://github.com/" + cfg.Owner + "/" + cfg.Repo + "/actions/workflows/" + cfg.WorkflowID,
					LastCheck:   time.Now(),
					Error:       err.Error(),
					Jobs:        []GitHubJob{},
				}
			}

			results <- status
		}(wfCfg)
	}

	// Close results channel when all goroutines complete
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results
	newWorkflows := make(map[string]*WorkflowQueueStatus)
	for status := range results {
		key := status.Owner + "/" + status.Repo + "/" + status.WorkflowID
		newWorkflows[key] = status
	}

	// Build order from config to preserve config order
	order := make([]string, 0, len(workflows))
	for _, wfCfg := range workflows {
		key := wfCfg.Owner + "/" + wfCfg.Repo + "/" + wfCfg.WorkflowID
		order = append(order, key)
	}

	// Update cache
	c.githubMu.Lock()
	c.githubWorkflows = newWorkflows
	c.githubWorkflowOrder = order
	c.githubMu.Unlock()

	c.log.Debug("GitHub workflow queue refresh complete")
}

// GetGitHubQueueStatus returns the aggregated GitHub queue status in config order
func (c *Cache) GetGitHubQueueStatus() *GitHubQueueResponse {
	c.githubMu.RLock()
	defer c.githubMu.RUnlock()

	response := &GitHubQueueResponse{
		Workflows:       make([]WorkflowQueueStatus, 0, len(c.githubWorkflows)),
		RateLimitRemain: -1,
	}

	if c.githubClient != nil {
		response.RateLimitRemain = c.githubClient.RateLimitRemaining()
	}

	for _, key := range c.githubWorkflowOrder {
		if status, ok := c.githubWorkflows[key]; ok {
			response.Workflows = append(response.Workflows, *status)
			response.TotalQueued += status.QueuedCount
			response.TotalRunning += status.RunningCount
		}
	}

	return response
}

// GetGitHubStats returns total queued and running GitHub jobs
func (c *Cache) GetGitHubStats() (queued, running int) {
	c.githubMu.RLock()
	defer c.githubMu.RUnlock()

	for _, status := range c.githubWorkflows {
		queued += status.QueuedCount
		running += status.RunningCount
	}
	return
}

// fetchDirectories fetches config.json and all directory index.json files for an instance
func (c *Cache) fetchDirectories(ctx context.Context, uiURL string, log logrus.FieldLogger) []DirectoryInfo {
	if uiURL == "" {
		return nil
	}

	// Fetch UI config.json
	uiConfig, err := c.client.FetchUIConfig(ctx, uiURL)
	if err != nil {
		log.WithError(err).WithField("ui_url", uiURL).Debug("Failed to fetch UI config for directories")
		return nil
	}

	if len(uiConfig.Directories) == 0 {
		log.WithField("ui_url", uiURL).Debug("No directories found in UI config")
		return nil
	}

	log.WithFields(logrus.Fields{
		"ui_url":      uiURL,
		"directories": len(uiConfig.Directories),
	}).Debug("Found directories in UI config")

	// Fetch each directory's index.json concurrently
	var wg sync.WaitGroup
	results := make(chan DirectoryInfo, len(uiConfig.Directories))

	for _, dir := range uiConfig.Directories {
		if !dir.IsEnabled() {
			continue
		}

		wg.Add(1)
		go func(d UIDirectory) {
			defer wg.Done()

			info := DirectoryInfo{
				Name:         d.Name,
				DisplayName:  d.DisplayName,
				URL:          d.URL,
				StatusCounts: make(map[string]int),
			}

			indexCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()

			index, err := c.client.FetchDirectoryIndex(indexCtx, d.URL)
			if err != nil {
				// Check if it's a 404 error
				var httpErr *HTTPError
				if errors.As(err, &httpErr) && httpErr.StatusCode == 404 {
					info.FetchError = "The directory test result index doesn't exist"
				} else {
					info.FetchError = err.Error()
				}
				results <- info
				return
			}

			info.Generated = index.Generated
			info.TotalTests = len(index.Entries)

			// Capture last 5 entries as recent runs (entries are ordered oldest to newest)
			recentRuns := make([]RecentRun, 0, 5)
			startIdx := len(index.Entries) - 5
			if startIdx < 0 {
				startIdx = 0
			}
			// Iterate in reverse to get newest first
			for i := len(index.Entries) - 1; i >= startIdx; i-- {
				entry := index.Entries[i]
				recentRuns = append(recentRuns, RecentRun{
					RunID:    entry.RunID,
					Status:   entry.SyncInfo.Status,
					ELClient: entry.ExecutionClientInfo.Type,
					CLClient: entry.ConsensusClientInfo.Type,
					Time:     entry.Timestamp,
				})
			}
			info.RecentRuns = recentRuns

			for _, entry := range index.Entries {
				status := entry.SyncInfo.Status
				if status == "" {
					status = "unknown"
				}
				info.StatusCounts[status]++
			}

			results <- info
		}(dir)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results in config order
	resultMap := make(map[string]DirectoryInfo)
	for info := range results {
		resultMap[info.Name] = info
	}

	// Build ordered slice
	directories := make([]DirectoryInfo, 0, len(uiConfig.Directories))
	for _, dir := range uiConfig.Directories {
		if !dir.IsEnabled() {
			continue
		}
		if info, ok := resultMap[dir.Name]; ok {
			directories = append(directories, info)
		}
	}

	return directories
}
