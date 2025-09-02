/**
 * Report types for the Syncoor web application
 */

/**
 * Client information structure
 */
export interface ClientInfo {
  /** Client name (e.g., 'geth', 'prysm') */
  name: string;
  /** Client type (e.g., 'execution', 'consensus') */
  type: string;
  /** Docker image or binary path */
  image: string;
  /** Client version */
  version: string;
  /** Docker entrypoint command */
  entrypoint?: string[];
  /** Docker cmd parameters */
  cmd?: string[];
  /** Environment variables used by the client */
  env_vars?: Record<string, string>;
}

/**
 * Sync information structure
 */
export interface SyncInfo {
  /** Sync start timestamp */
  start: string;
  /** Sync end timestamp */
  end: string;
  /** Total sync duration in seconds */
  duration: number;
  /** Sync status: 'success', 'timeout', 'cancelled', 'error' */
  status?: string;
  /** Detailed status message */
  status_message?: string;
  /** Target block number */
  block: number;
  /** Target slot number */
  slot: number;
  /** Number of progress entries recorded */
  entries_count: number;
  /** Last progress entry recorded */
  last_entry?: ProgressEntry;
}

/**
 * Individual index entry representing a test run
 */
export interface IndexEntry {
  /** Unique identifier for the test run */
  run_id: string;
  /** Timestamp when the test was executed */
  timestamp: string;
  /** Network name (e.g., 'mainnet', 'sepolia') */
  network: string;
  /** Source directory for the test files */
  source_directory: string;
  /** Base URL for the test files */
  source_url: string;
  /** Execution client information */
  execution_client_info: ClientInfo;
  /** Consensus client information */
  consensus_client_info: ClientInfo;
  /** Sync information and statistics */
  sync_info: SyncInfo;
  /** Path to the main report file */
  main_file: string;
  /** Path to the progress file */
  progress_file: string;
  /** Path to the dump file (if exists) */
  dump_file?: string;
}

/**
 * Progress entry structure with sync progress metrics
 */
export interface ProgressEntry {
  /** Timestamp - Unix timestamp of the progress entry */
  t: number;
  /** Block - Current block number */
  b: number;
  /** Slot - Current slot number */
  s: number;
  /** Database size execution - Execution client database size in bytes */
  de: number;
  /** Database size consensus - Consensus client database size in bytes */
  dc: number;
  /** Peers execution - Number of peers connected to execution client */
  pe: number;
  /** Peers consensus - Number of peers connected to consensus client */
  pc: number;
}

/**
 * Report index structure containing all test runs
 */
export interface ReportIndex {
  /** Timestamp when the index was generated */
  generated: string;
  /** Array of test run entries */
  entries: IndexEntry[];
}

/**
 * Main test report structure
 */
export interface TestReport {
  /** Unique test run identifier */
  run_id: string;
  /** Test execution timestamp */
  timestamp: string;
  /** Network being tested */
  network: string;
  /** Test description or name */
  test_name: string;
  /** Test status: 'completed' | 'failed' | 'running' */
  status: 'completed' | 'failed' | 'running';
  /** Execution client information */
  execution_client: ClientInfo;
  /** Consensus client information */
  consensus_client: ClientInfo;
  /** Sync information and results */
  sync_info: SyncInfo;
  /** Array of progress entries */
  progress?: ProgressEntry[];
  /** Test metadata */
  metadata?: {
    /** Test configuration parameters */
    config?: Record<string, string | number | boolean>;
    /** Environment variables */
    environment?: Record<string, string>;
    /** Additional notes */
    notes?: string;
  };
  /** Error information if test failed */
  error?: {
    /** Error message */
    message: string;
    /** Stack trace */
    stack?: string;
    /** Error timestamp */
    timestamp: string;
  };
}

/**
 * ZIP file entry information
 */
export interface ZipFileEntry {
  /** File name/path within the ZIP */
  name: string;
  /** Uncompressed size in bytes */
  size: number;
  /** Compressed size in bytes */
  compressed_size: number;
  /** Last modified timestamp */
  modified: string;
  /** Whether this entry is a directory */
  is_directory: boolean;
}

/**
 * ZIP file information response
 */
export interface ZipFileInfo {
  /** Whether the ZIP file exists */
  exists: boolean;
  /** Total ZIP file size in bytes */
  size?: number;
  /** List of files/directories in the ZIP */
  entries?: ZipFileEntry[];
  /** Error message if failed to read */
  error?: string;
}