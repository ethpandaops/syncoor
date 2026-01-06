/**
 * Types for Control Center API responses
 */

import { TestSummary, TestDetail } from './syncoor';

/**
 * Instance health status
 */
export type InstanceStatus = 'healthy' | 'unhealthy' | 'unknown';

/**
 * A recent test run from a directory
 */
export interface RecentRun {
  run_id: string;
  status: string;
  el_client: string;
  cl_client: string;
  time: number;
}

/**
 * Directory information from config.json and index.json
 */
export interface DirectoryInfo {
  name: string;
  display_name: string;
  url: string;
  generated: number;
  total_tests: number;
  status_counts: Record<string, number>;
  fetch_error?: string;
  recent_runs?: RecentRun[];
}

/**
 * Health information for a Syncoor instance
 */
export interface InstanceHealth {
  name: string;
  api_url: string;
  ui_url: string;
  status: InstanceStatus;
  active_tests: number;
  total_tests: number;
  last_check: string;
  last_success?: string;
  error_message?: string;
  directories?: DirectoryInfo[];
}

/**
 * Test summary with instance information
 */
export interface AggregatedTestSummary extends TestSummary {
  instance_name: string;
  instance_api_url: string;
  instance_ui_url: string;
}

/**
 * Test detail with instance information
 */
export interface AggregatedTestDetail extends TestDetail {
  instance_name: string;
  instance_api_url: string;
  instance_ui_url: string;
}

/**
 * Response for aggregated test list
 */
export interface AggregatedTestListResponse {
  tests: AggregatedTestSummary[];
  total_count: number;
  active_count: number;
  instance_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * Response for instance list
 */
export interface InstanceListResponse {
  instances: InstanceHealth[];
}

/**
 * Control Center status response
 */
export interface CCStatusResponse {
  instances: InstanceHealth[];
  total_tests: number;
  active_tests: number;
  healthy_instances: number;
  last_refresh: string;
  github_queued: number;
  github_running: number;
}

/**
 * GitHub job status
 */
export type GitHubJobStatus = 'queued' | 'in_progress' | 'waiting' | 'completed' | 'pending';

/**
 * A single GitHub Actions job
 */
export interface GitHubJob {
  id: number;
  run_id: number;
  name: string;
  status: GitHubJobStatus;
  conclusion?: string;
  started_at?: string;
  created_at: string;
  html_url: string;
  branch: string;
  actor: string;
  actor_avatar: string;
  run_number: number;
}

/**
 * Queue status for a single GitHub workflow
 */
export interface WorkflowQueueStatus {
  name: string;
  owner: string;
  repo: string;
  workflow_id: string;
  workflow_url: string;
  queued_count: number;
  running_count: number;
  jobs: GitHubJob[];
  last_check: string;
  error?: string;
}

/**
 * Response for GitHub queue status
 */
export interface GitHubQueueResponse {
  workflows: WorkflowQueueStatus[];
  total_queued: number;
  total_running: number;
  rate_limit_remaining: number;
}

/**
 * Control Center health response
 */
export interface CCHealthResponse {
  status: string;
  instance_count: number;
  healthy_instances: number;
  total_tests: number;
  active_tests: number;
}

/**
 * Filters for fetching tests
 */
export interface CCTestFilters {
  active?: boolean;
  instance?: string;
  network?: string;
  el_client?: string;
  cl_client?: string;
  sort_by?: 'start_time' | 'last_update' | 'instance_name' | 'network' | 'el_client' | 'cl_client';
  sort_order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

/**
 * Base API response wrapper for Control Center
 */
export interface CCApiResponse<T> {
  data: T;
  error?: {
    code: string;
    message: string;
  };
}
