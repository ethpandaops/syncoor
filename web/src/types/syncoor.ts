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
 * System information for a test run
 */
export interface SystemInfo {
  hostname?: string;
  go_version?: string;
  syncoor_version?: string;
  os_name?: string;
  os_vendor?: string;
  os_version?: string;
  os_architecture?: string;
  kernel_version?: string;
  kernel_release?: string;
  cpu_vendor?: string;
  cpu_model?: string;
  cpu_cache?: number;
  cpu_cores?: number;
  cpu_threads?: number;
  total_memory?: number;
  product_vendor?: string;
  board_name?: string;
  board_vendor?: string;
  platform_family?: string;
  platform_version?: string;
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
  el_client_config: ClientConfig;
  cl_client_config: ClientConfig;
  current_metrics?: ProgressMetrics;
  system_info?: SystemInfo;
  run_timeout?: number;
  error?: string;
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
  env_vars?: Record<string, string>;
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
  run_timeout?: number;
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