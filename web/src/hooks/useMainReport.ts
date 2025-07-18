import { useQuery } from '@tanstack/react-query';

interface UseMainReportParams {
  mainUrl: string;
  enabled?: boolean;
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
    block: number;
    slot: number;
    sync_progress_file: string;
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
  sync_info: {
    start: string;
    end: string;
    duration: number;
    block: number;
    slot: number;
    entries_count: number;
  };
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