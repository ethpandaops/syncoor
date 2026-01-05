import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import WorkflowQueueCard from './WorkflowQueueCard';
import { useCCGitHubQueue, useCCTests } from '../../hooks/useControlCenter';
import { GitHubJob, GitHubJobStatus } from '../../types/controlCenter';

type StatusFilter = 'all' | 'queued' | 'in_progress';

interface GitHubQueueSectionProps {
  endpoint: string;
}

const GitHubQueueSection: React.FC<GitHubQueueSectionProps> = ({ endpoint }) => {
  const { data, isLoading, error } = useCCGitHubQueue(endpoint);
  const { data: testsData } = useCCTests(endpoint, { page_size: 200 });
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Build set of job IDs that are connected to tests
  const connectedJobIds = useMemo(() => {
    const ids = new Set<string>();
    if (testsData?.tests) {
      for (const test of testsData.tests) {
        const jobId = test.labels?.['github.job_id'];
        if (jobId) {
          ids.add(jobId);
        }
      }
    }
    return ids;
  }, [testsData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitHubIcon className="h-5 w-5" />
            GitHub Queue
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-32 bg-muted rounded-lg" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitHubIcon className="h-5 w-5" />
            GitHub Queue
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-sm text-red-600 dark:text-red-400">
            Failed to load GitHub queue: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.workflows.length === 0) {
    return null;
  }

  // Collect all jobs from all workflows
  const allJobs: (GitHubJob & { workflowName: string })[] = [];
  for (const workflow of data.workflows) {
    for (const job of workflow.jobs) {
      allJobs.push({ ...job, workflowName: workflow.name });
    }
  }

  // Sort jobs: queued/waiting first, then running, by created_at
  allJobs.sort((a, b) => {
    const statusOrder = (status: GitHubJobStatus) => {
      if (status === 'queued' || status === 'waiting' || status === 'pending') return 0;
      if (status === 'in_progress') return 1;
      return 2;
    };
    const orderDiff = statusOrder(a.status) - statusOrder(b.status);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Count connected jobs (total and per workflow)
  const connectedCount = allJobs.filter((job) => connectedJobIds.has(String(job.id))).length;
  const connectedCountByWorkflow = new Map<string, number>();
  for (const workflow of data.workflows) {
    const key = `${workflow.owner}/${workflow.repo}/${workflow.workflow_id}`;
    const count = workflow.jobs.filter((job) => connectedJobIds.has(String(job.id))).length;
    connectedCountByWorkflow.set(key, count);
  }

  // Filter jobs by status
  const isQueuedStatus = (status: GitHubJobStatus) =>
    status === 'queued' || status === 'waiting' || status === 'pending';

  const filteredJobs = allJobs.filter((job) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'queued') return isQueuedStatus(job.status);
    if (statusFilter === 'in_progress') return job.status === 'in_progress';
    return true;
  });

  const displayedJobs = showAllJobs ? filteredJobs : filteredJobs.slice(0, 5);
  const hasMoreJobs = filteredJobs.length > 5;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitHubIcon className="h-5 w-5" />
            GitHub Queue
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.total_queued > 0 && (
              <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400">
                {data.total_queued} queued
              </Badge>
            )}
            {data.total_running > 0 && (
              <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                {data.total_running} running
              </Badge>
            )}
            {connectedCount > 0 && (
              <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                {connectedCount} connected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Workflow cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.workflows.map((workflow) => {
            const key = `${workflow.owner}/${workflow.repo}/${workflow.workflow_id}`;
            return (
              <WorkflowQueueCard
                key={key}
                workflow={workflow}
                connectedCount={connectedCountByWorkflow.get(key) || 0}
              />
            );
          })}
        </div>

        {/* Job list */}
        {allJobs.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Active Jobs</h4>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setShowAllJobs(false); }}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {displayedJobs.length > 0 ? (
                displayedJobs.map((job) => (
                  <JobRow key={job.id} job={job} isConnected={connectedJobIds.has(String(job.id))} />
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No {statusFilter === 'queued' ? 'queued' : statusFilter === 'in_progress' ? 'running' : ''} jobs
                </div>
              )}
            </div>
            {hasMoreJobs && (
              <div className="mt-3 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllJobs(!showAllJobs)}
                >
                  {showAllJobs ? 'Show Less' : `Show All (${filteredJobs.length})`}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Rate limit warning */}
        {data.rate_limit_remaining >= 0 && data.rate_limit_remaining < 100 && (
          <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
            GitHub API rate limit: {data.rate_limit_remaining} requests remaining
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface JobRowProps {
  job: GitHubJob & { workflowName: string };
  isConnected: boolean;
}

const JobRow: React.FC<JobRowProps> = ({ job, isConnected }) => {
  const formatTimeAgo = (timestamp: string): string => {
    if (!timestamp) return '';
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes === 1) return '1m ago';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Determine the display type - Connected takes priority
  const getTypeDisplay = () => {
    if (isConnected) {
      return { label: 'Connected', variant: 'success' as const, color: 'bg-green-500' };
    }
    if (job.status === 'in_progress') {
      return { label: 'In Progress', variant: 'default' as const, color: 'bg-blue-500' };
    }
    return { label: 'Queued', variant: 'outline' as const, color: 'bg-yellow-500' };
  };

  const typeDisplay = getTypeDisplay();

  return (
    <div className="flex items-center p-2 bg-muted/50 rounded-lg text-sm gap-3">
      {/* Type column */}
      <div className="w-28 flex-shrink-0 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${typeDisplay.color} flex-shrink-0`} />
        <Badge variant={typeDisplay.variant} className="text-xs flex-1 justify-center">
          {typeDisplay.label}
        </Badge>
      </div>

      {/* Job info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {job.actor_avatar && (
          <img
            src={job.actor_avatar}
            alt={job.actor}
            className="w-5 h-5 rounded-full flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{job.name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            <span>{job.workflowName}</span>
            <span>#{job.run_number}</span>
            <span className="truncate">{job.branch}</span>
          </div>
        </div>
      </div>

      {/* Time and link */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-muted-foreground">
          {formatTimeAgo(job.created_at)}
        </span>
        <a
          href={job.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <ExternalLinkIcon className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
};

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default GitHubQueueSection;
