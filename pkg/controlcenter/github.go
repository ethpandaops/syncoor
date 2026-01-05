package controlcenter

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/sirupsen/logrus"
)

const (
	githubAPIBaseURL    = "https://api.github.com"
	githubDefaultTimeout = 15 * time.Second
)

// GitHubClient is an HTTP client for the GitHub API
type GitHubClient struct {
	log             logrus.FieldLogger
	httpClient      *http.Client
	token           string
	rateLimitRemain int
}

// NewGitHubClient creates a new GitHub API client
func NewGitHubClient(log logrus.FieldLogger, token string) *GitHubClient {
	return &GitHubClient{
		log: log,
		httpClient: &http.Client{
			Timeout: githubDefaultTimeout,
		},
		token:           token,
		rateLimitRemain: -1, // Unknown until first request
	}
}

// RateLimitRemaining returns the remaining API rate limit
func (c *GitHubClient) RateLimitRemaining() int {
	return c.rateLimitRemain
}

// GitHub API response types (internal)
type githubWorkflowRunsResponse struct {
	TotalCount   int                 `json:"total_count"`
	WorkflowRuns []githubWorkflowRun `json:"workflow_runs"`
}

type githubWorkflowRun struct {
	ID           int64       `json:"id"`
	Name         string      `json:"name"`
	Status       string      `json:"status"`
	Conclusion   string      `json:"conclusion"`
	RunNumber    int         `json:"run_number"`
	HeadBranch   string      `json:"head_branch"`
	HTMLURL      string      `json:"html_url"`
	CreatedAt    string      `json:"created_at"`
	UpdatedAt    string      `json:"updated_at"`
	Actor        githubActor `json:"actor"`
	TriggeringActor githubActor `json:"triggering_actor"`
}

type githubActor struct {
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
}

type githubJobsResponse struct {
	TotalCount int         `json:"total_count"`
	Jobs       []githubJob `json:"jobs"`
}

type githubJob struct {
	ID          int64  `json:"id"`
	RunID       int64  `json:"run_id"`
	Name        string `json:"name"`
	Status      string `json:"status"`
	Conclusion  string `json:"conclusion"`
	StartedAt   string `json:"started_at"`
	CompletedAt string `json:"completed_at"`
	HTMLURL     string `json:"html_url"`
}

// FetchWorkflowQueue fetches queued and in-progress runs for a workflow
func (c *GitHubClient) FetchWorkflowQueue(ctx context.Context, cfg WorkflowConfig) (*WorkflowQueueStatus, error) {
	status := &WorkflowQueueStatus{
		Name:        cfg.Name,
		Owner:       cfg.Owner,
		Repo:        cfg.Repo,
		WorkflowID:  cfg.WorkflowID,
		WorkflowURL: fmt.Sprintf("https://github.com/%s/%s/actions/workflows/%s", cfg.Owner, cfg.Repo, cfg.WorkflowID),
		LastCheck:   time.Now(),
		Jobs:        []GitHubJob{},
	}

	// Fetch queued runs
	queuedRuns, err := c.fetchWorkflowRuns(ctx, cfg.Owner, cfg.Repo, cfg.WorkflowID, "queued")
	if err != nil {
		status.Error = fmt.Sprintf("failed to fetch queued runs: %v", err)
		return status, nil
	}

	// Fetch in_progress runs
	inProgressRuns, err := c.fetchWorkflowRuns(ctx, cfg.Owner, cfg.Repo, cfg.WorkflowID, "in_progress")
	if err != nil {
		status.Error = fmt.Sprintf("failed to fetch in_progress runs: %v", err)
		return status, nil
	}

	// Fetch waiting runs
	waitingRuns, err := c.fetchWorkflowRuns(ctx, cfg.Owner, cfg.Repo, cfg.WorkflowID, "waiting")
	if err != nil {
		// Log but don't fail - waiting status might not be supported
		c.log.WithError(err).Debug("failed to fetch waiting runs")
		waitingRuns = &githubWorkflowRunsResponse{}
	}

	// Combine all runs and fetch their jobs
	allRuns := append(queuedRuns.WorkflowRuns, inProgressRuns.WorkflowRuns...)
	allRuns = append(allRuns, waitingRuns.WorkflowRuns...)

	for _, run := range allRuns {
		jobs, err := c.fetchRunJobs(ctx, cfg.Owner, cfg.Repo, run.ID)
		if err != nil {
			c.log.WithError(err).WithField("run_id", run.ID).Warn("failed to fetch jobs for run")
			continue
		}

		for _, job := range jobs.Jobs {
			// Only include non-completed jobs
			if job.Status == "completed" {
				continue
			}

			actor := run.TriggeringActor.Login
			if actor == "" {
				actor = run.Actor.Login
			}
			avatar := run.TriggeringActor.AvatarURL
			if avatar == "" {
				avatar = run.Actor.AvatarURL
			}

			ghJob := GitHubJob{
				ID:          job.ID,
				RunID:       run.ID,
				Name:        job.Name,
				Status:      job.Status,
				Conclusion:  job.Conclusion,
				StartedAt:   job.StartedAt,
				CreatedAt:   run.CreatedAt,
				HTMLURL:     job.HTMLURL,
				Branch:      run.HeadBranch,
				Actor:       actor,
				ActorAvatar: avatar,
				RunNumber:   run.RunNumber,
			}

			status.Jobs = append(status.Jobs, ghJob)

			if job.Status == "queued" || job.Status == "waiting" || job.Status == "pending" {
				status.QueuedCount++
			} else if job.Status == "in_progress" {
				status.RunningCount++
			}
		}
	}

	return status, nil
}

func (c *GitHubClient) fetchWorkflowRuns(ctx context.Context, owner, repo, workflowID, status string) (*githubWorkflowRunsResponse, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/actions/workflows/%s/runs?status=%s&per_page=50",
		githubAPIBaseURL, owner, repo, workflowID, status)

	var result githubWorkflowRunsResponse
	if err := c.doRequest(ctx, url, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

func (c *GitHubClient) fetchRunJobs(ctx context.Context, owner, repo string, runID int64) (*githubJobsResponse, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/actions/runs/%d/jobs?filter=latest&per_page=100",
		githubAPIBaseURL, owner, repo, runID)

	var result githubJobsResponse
	if err := c.doRequest(ctx, url, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

func (c *GitHubClient) doRequest(ctx context.Context, url string, result interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "syncoor-control-center")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Track rate limit
	if remaining := resp.Header.Get("X-RateLimit-Remaining"); remaining != "" {
		if val, err := strconv.Atoi(remaining); err == nil {
			c.rateLimitRemain = val
			if val < 100 {
				c.log.WithField("remaining", val).Warn("GitHub API rate limit running low")
			}
		}
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if err := json.Unmarshal(body, result); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}

	return nil
}
