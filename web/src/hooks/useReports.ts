import { useQuery } from '@tanstack/react-query';
import { fetchIndex } from '../lib/api';
import { Directory } from '../types/config';
import { IndexEntry } from '../types/report';
import { TestFilterParams, PaginationParams } from '../types/api';

/**
 * Combined report entry with source directory information
 */
export interface ReportEntry extends IndexEntry {
  /** Source directory name */
  source_directory: string;
  /** Source directory URL */
  source_url: string;
}

/**
 * Hook parameters for filtering and pagination
 */
export interface UseReportsParams {
  /** Enabled directories from config */
  directories: Directory[];
  /** Filter parameters */
  filters?: TestFilterParams;
  /** Pagination parameters */
  pagination?: PaginationParams;
}

/**
 * Hook result with aggregated and filtered reports
 */
export interface UseReportsResult {
  /** Array of report entries */
  data: ReportEntry[];
  /** Total count before pagination */
  total: number;
  /** Current page */
  page: number;
  /** Items per page */
  limit: number;
  /** Total pages */
  totalPages: number;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Filters reports based on provided criteria
 */
function filterReports(reports: ReportEntry[], filters: TestFilterParams): ReportEntry[] {
  return reports.filter(report => {
    if (filters.directory && report.source_directory !== filters.directory) {
      return false;
    }
    
    if (filters.network && report.network !== filters.network) {
      return false;
    }
    
    if (filters.execution_client && !report.execution_client_info.name.includes(filters.execution_client)) {
      return false;
    }
    
    if (filters.consensus_client && !report.consensus_client_info.name.includes(filters.consensus_client)) {
      return false;
    }
    
    if (filters.start_date && new Date(report.timestamp) < new Date(filters.start_date)) {
      return false;
    }
    
    if (filters.end_date && new Date(report.timestamp) > new Date(filters.end_date)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Paginates reports array
 */
function paginateReports(reports: ReportEntry[], pagination: PaginationParams): ReportEntry[] {
  const start = (pagination.page - 1) * pagination.limit;
  const end = start + pagination.limit;
  return reports.slice(start, end);
}

/**
 * Sorts reports by the specified field and order
 */
function sortReports(reports: ReportEntry[], sortBy: string, sortOrder: 'asc' | 'desc'): ReportEntry[] {
  return [...reports].sort((a, b) => {
    let aValue: string | number;
    let bValue: string | number;
    
    switch (sortBy) {
      case 'timestamp':
        aValue = new Date(a.timestamp).getTime();
        bValue = new Date(b.timestamp).getTime();
        break;
      case 'network':
        aValue = a.network;
        bValue = b.network;
        break;
      case 'execution_client':
        aValue = a.execution_client_info.name;
        bValue = b.execution_client_info.name;
        break;
      case 'consensus_client':
        aValue = a.consensus_client_info.name;
        bValue = b.consensus_client_info.name;
        break;
      case 'duration':
        aValue = a.sync_info.duration;
        bValue = b.sync_info.duration;
        break;
      default:
        aValue = a.timestamp;
        bValue = b.timestamp;
    }
    
    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Hook to fetch indexes from all enabled directories and aggregate results
 * @param params - Configuration and filtering parameters
 * @returns Aggregated, filtered, and paginated reports with loading/error states
 */
export function useReports(params: UseReportsParams): UseReportsResult {
  const { directories, filters = {}, pagination = { page: 1, limit: 20, sortBy: 'timestamp', sortOrder: 'desc' } } = params;
  
  const enabledDirectories = directories.filter(dir => dir.enabled);
  
  const query = useQuery({
    queryKey: ['reports', enabledDirectories.map(d => d.url), filters, pagination],
    queryFn: async () => {
      // Fetch indexes from all enabled directories
      const indexPromises = enabledDirectories.map(async (directory) => {
        try {
          const index = await fetchIndex(directory);
          return {
            directory,
            index,
            error: null,
          };
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(`Failed to fetch index from ${directory.name}:`, error);
          return {
            directory,
            index: null,
            error: error as Error,
          };
        }
      });
      
      const results = await Promise.all(indexPromises);
      
      // Aggregate all entries with source directory information
      const allReports: ReportEntry[] = [];
      
      results.forEach(result => {
        if (result.index) {
          const reportsWithSource = result.index.entries.map(entry => ({
            ...entry,
            source_directory: result.directory.name,
            source_url: result.directory.url,
          }));
          allReports.push(...reportsWithSource);
        }
      });
      
      // Sort by timestamp (newest first) by default
      let sortedReports = sortReports(
        allReports,
        pagination.sortBy || 'timestamp',
        pagination.sortOrder || 'desc'
      );
      
      // Apply filters
      const filteredReports = filterReports(sortedReports, filters);
      
      // Apply pagination
      const paginatedReports = paginateReports(filteredReports, pagination);
      
      return {
        reports: paginatedReports,
        total: filteredReports.length,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(filteredReports.length / pagination.limit),
      };
    },
    enabled: enabledDirectories.length > 0,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
  
  return {
    data: query.data?.reports || [],
    total: query.data?.total || 0,
    page: query.data?.page || 1,
    limit: query.data?.limit || 20,
    totalPages: query.data?.totalPages || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}