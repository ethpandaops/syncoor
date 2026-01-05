/**
 * Types for Control Center API responses
 */

import { TestSummary, TestDetail } from './syncoor';

/**
 * Instance health status
 */
export type InstanceStatus = 'healthy' | 'unhealthy' | 'unknown';

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
