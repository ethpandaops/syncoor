/**
 * Types for Syncoor API responses
 */

/**
 * Base API response wrapper
 */
export interface SyncoorApiResponse<T> {
  data: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Progress metrics from a running test
 */
export interface ProgressMetrics {
  block: number;
  slot: number;
  exec_disk_usage: number;
  cons_disk_usage: number;
  exec_peers: number;
  cons_peers: number;
  exec_sync_percent: number;
  cons_sync_percent: number;
  exec_version?: string;
  cons_version?: string;
}

/**
 * Test summary data
 */
export interface TestSummary {
  run_id: string;
  network: string;
  labels: Record<string, string>;
  start_time: string;
  last_update: string;
  is_running: boolean;
  is_complete: boolean;
  el_client: string;
  cl_client: string;
  current_metrics?: ProgressMetrics;
}

/**
 * Progress point with timestamp
 */
export interface ProgressPoint {
  timestamp: string;
  metrics: ProgressMetrics;
}

/**
 * Client configuration
 */
export interface ClientConfig {
  type: string;
  image: string;
  extra_args?: string[];
}

/**
 * Detailed test information
 */
export interface TestDetail {
  run_id: string;
  network: string;
  labels: Record<string, string>;
  start_time: string;
  last_update: string;
  is_running: boolean;
  is_complete: boolean;
  el_client: string;
  cl_client: string;
  current_metrics?: ProgressMetrics;
  progress_history: ProgressPoint[];
  el_client_config: ClientConfig;
  cl_client_config: ClientConfig;
  enclave_name: string;
  end_time?: string;
  error?: string;
}

/**
 * Test list response
 */
export interface TestListResponse {
  tests: TestSummary[];
  total_count: number;
  active_count: number;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: string;
  active_tests: number;
  total_tests: number;
}