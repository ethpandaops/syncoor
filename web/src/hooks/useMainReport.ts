import { useQuery } from '@tanstack/react-query';

interface UseMainReportParams {
  mainUrl: string;
  enabled?: boolean;
}

/**
 * System information structure
 */
export interface SystemInfo {
  // Basic system information
  hostname: string;
  go_version: string;
  syncoor_version?: string;
  
  // Enhanced OS information
  os_name?: string;
  os_vendor?: string;
  os_version?: string;
  os_release?: string;
  os_architecture?: string;
  kernel_version?: string;
  kernel_release?: string;
  
  // CPU information
  cpu_vendor?: string;
  cpu_model?: string;
  cpu_speed?: number;   // MHz
  cpu_cache?: number;   // KB
  cpu_cores?: number;   // Physical cores
  cpu_threads?: number; // Logical cores
  
  // Memory information
  total_memory: number; // Bytes
  memory_type?: string;
  memory_speed?: number; // MT/s
  
  // Hardware information
  hypervisor?: string;
  timezone?: string;
  product_name?: string;
  product_vendor?: string;
  board_name?: string;
  board_vendor?: string;
  
  // Legacy fields for backward compatibility
  platform_family?: string;
  platform_version?: string;
}

/**
 * Main report structure with additional client details
 */
export interface MainReport {
  run_id: string;
  timestamp: number;
  network: string;
  sync_status: {
    start: number;
    end: number;
    status?: string;
    status_message?: string;
    block: number;
    slot: number;
    sync_progress_file: string;
    entries_count: number;
    last_entry?: {
      t: number;
      b: number;
      s: number;
      de: number;
      dc: number;
      pe: number;
      pc: number;
    };
  };
  execution_client_info: {
    name: string;
    type: string;
    image: string;
    version: string;
    entrypoint?: string[];
    cmd?: string[];
  };
  consensus_client_info: {
    name: string;
    type: string;
    image: string;
    version: string;
    entrypoint?: string[];
    cmd?: string[];
  };
  system_info?: SystemInfo;
  labels?: Record<string, string>;
  metadata?: {
    config?: Record<string, any>;
    environment?: Record<string, string>;
    notes?: string;
  };
  error?: {
    message: string;
    stack?: string;
    timestamp: string;
  };
}

/**
 * Hook to fetch main report data from a main.json file
 * @param params - Parameters including the main file URL and enabled flag
 * @returns Query result with main report data
 */
export function useMainReport({ mainUrl, enabled = true }: UseMainReportParams) {
  return useQuery<MainReport, Error>({
    queryKey: ['mainReport', mainUrl],
    queryFn: async () => {
      const response = await fetch(mainUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch main report: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Basic validation
      if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid main report data: expected object');
      }
      
      // Check required fields
      const requiredFields = ['run_id', 'execution_client_info', 'consensus_client_info'];
      for (const field of requiredFields) {
        if (!data[field]) {
          throw new Error(`Invalid main report: missing required field '${field}'`);
        }
      }
      
      return data as MainReport;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}