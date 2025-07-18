/**
 * API types for the Syncoor web application
 */

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  /** Response data */
  data?: T;
  /** Error message if request failed */
  error?: string;
  /** HTTP status code */
  status: number;
  /** Response timestamp */
  timestamp: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  /** Page number (1-based) */
  page: number;
  /** Number of items per page */
  limit: number;
  /** Sort field */
  sortBy?: string;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  /** Array of items */
  items: T[];
  /** Total number of items */
  total: number;
  /** Current page */
  page: number;
  /** Items per page */
  limit: number;
  /** Total number of pages */
  totalPages: number;
}

/**
 * Test summary for list views
 */
export interface TestSummary {
  /** Unique test identifier */
  run_id: string;
  /** Test execution timestamp */
  timestamp: string;
  /** Network name */
  network: string;
  /** Test name or description */
  test_name: string;
  /** Current test status */
  status: 'completed' | 'failed' | 'running' | 'pending';
  /** Execution client name and version */
  execution_client: string;
  /** Consensus client name and version */
  consensus_client: string;
  /** Sync duration in seconds (if completed) */
  duration?: number;
  /** Sync progress percentage (0-100) */
  progress?: number;
  /** Last update timestamp */
  last_updated: string;
}

/**
 * Live test progress information
 */
export interface TestProgress {
  /** Test run identifier */
  run_id: string;
  /** Current status */
  status: 'running' | 'completed' | 'failed';
  /** Progress percentage (0-100) */
  progress: number;
  /** Current block number */
  current_block: number;
  /** Target block number */
  target_block: number;
  /** Current slot number */
  current_slot: number;
  /** Target slot number */
  target_slot: number;
  /** Blocks per second sync rate */
  blocks_per_second: number;
  /** Estimated time remaining in seconds */
  estimated_time_remaining?: number;
  /** Last update timestamp */
  last_updated: string;
  /** Current metrics */
  metrics: {
    /** Execution client database size in bytes */
    execution_db_size: number;
    /** Consensus client database size in bytes */
    consensus_db_size: number;
    /** Execution client peer count */
    execution_peers: number;
    /** Consensus client peer count */
    consensus_peers: number;
  };
}

/**
 * Filter parameters for test queries
 */
export interface TestFilterParams {
  /** Filter by directory */
  directory?: string;
  /** Filter by network */
  network?: string;
  /** Filter by execution client */
  execution_client?: string;
  /** Filter by consensus client */
  consensus_client?: string;
  /** Filter by status */
  status?: 'completed' | 'failed' | 'running' | 'pending';
  /** Start date filter (ISO 8601) */
  start_date?: string;
  /** End date filter (ISO 8601) */
  end_date?: string;
}

/**
 * Statistics summary
 */
export interface StatsSummary {
  /** Total number of tests */
  total_tests: number;
  /** Number of completed tests */
  completed_tests: number;
  /** Number of failed tests */
  failed_tests: number;
  /** Number of running tests */
  running_tests: number;
  /** Average sync duration in seconds */
  average_duration: number;
  /** Success rate percentage */
  success_rate: number;
  /** Statistics by network */
  by_network: Record<string, {
    total: number;
    completed: number;
    failed: number;
    average_duration: number;
  }>;
  /** Statistics by client combination */
  by_client_combo: Record<string, {
    total: number;
    completed: number;
    failed: number;
    average_duration: number;
  }>;
}

/**
 * WebSocket message types for live updates
 */
export interface WebSocketMessage {
  /** Message type */
  type: 'test_update' | 'test_started' | 'test_completed' | 'test_failed' | 'ping';
  /** Message payload */
  payload?: any;
  /** Message timestamp */
  timestamp: string;
}

/**
 * API error response
 */
export interface ApiError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: Record<string, any>;
  /** Request ID for tracking */
  request_id?: string;
}