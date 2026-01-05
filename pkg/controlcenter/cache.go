package controlcenter

import (
	"context"
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
	mu        sync.RWMutex
	log       logrus.FieldLogger
	client    *Client
	cfg       *Config
	instances map[string]*InstanceCache
	stopCh    chan struct{}
	wg        sync.WaitGroup

	// GitHub workflow queue caching
	githubClient    *GitHubClient
	githubMu        sync.RWMutex
	githubWorkflows map[string]*WorkflowQueueStatus // key: owner/repo/workflow_id
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

	var allTests []AggregatedTestSummary

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

// GetInstanceHealth returns the health status of all instances
func (c *Cache) GetInstanceHealth() []InstanceHealth {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var health []InstanceHealth
	for _, inst := range c.instances {
		inst.mu.RLock()
		health = append(health, inst.health)
		inst.mu.RUnlock()
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

	// Fetch tests
	tests, err := c.client.FetchTests(fetchCtx, config.APIUrl)
	now := time.Now()

	inst.mu.Lock()
	defer inst.mu.Unlock()

	inst.lastFetch = now

	if err != nil {
		inst.fetchError = err
		log.WithError(err).Warn("Failed to fetch tests from instance")

		// Check if cached data is still valid (within stale timeout)
		if time.Since(inst.lastSuccess) > c.cfg.Cache.StaleTimeout {
			inst.health.Status = StatusUnhealthy
		}
		inst.health.ErrorMessage = err.Error()
		inst.health.LastCheck = now
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
	}

	log.WithFields(logrus.Fields{
		"total_tests":  tests.TotalCount,
		"active_tests": tests.ActiveCount,
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

	// Update cache
	c.githubMu.Lock()
	c.githubWorkflows = newWorkflows
	c.githubMu.Unlock()

	c.log.Debug("GitHub workflow queue refresh complete")
}

// GetGitHubQueueStatus returns the aggregated GitHub queue status
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

	for _, status := range c.githubWorkflows {
		response.Workflows = append(response.Workflows, *status)
		response.TotalQueued += status.QueuedCount
		response.TotalRunning += status.RunningCount
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
