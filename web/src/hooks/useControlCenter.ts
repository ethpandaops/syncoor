import { useQuery } from '@tanstack/react-query';
import {
  fetchCCStatus,
  fetchCCInstances,
  fetchCCTests,
  fetchCCTestDetail,
  fetchCCHealth,
  fetchCCGitHubQueue,
} from '../lib/controlCenterApi';
import {
  CCStatusResponse,
  InstanceListResponse,
  AggregatedTestListResponse,
  AggregatedTestDetail,
  CCHealthResponse,
  CCTestFilters,
  GitHubQueueResponse,
} from '../types/controlCenter';

/**
 * Hook to fetch Control Center status
 */
export function useCCStatus(endpoint: string | undefined) {
  return useQuery<CCStatusResponse, Error>({
    queryKey: ['cc-status', endpoint],
    queryFn: () => {
      if (!endpoint) throw new Error('No Control Center endpoint configured');
      return fetchCCStatus(endpoint);
    },
    enabled: !!endpoint,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch Control Center instances
 */
export function useCCInstances(endpoint: string | undefined) {
  return useQuery<InstanceListResponse, Error>({
    queryKey: ['cc-instances', endpoint],
    queryFn: () => {
      if (!endpoint) throw new Error('No Control Center endpoint configured');
      return fetchCCInstances(endpoint);
    },
    enabled: !!endpoint,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch aggregated tests from Control Center
 */
export function useCCTests(endpoint: string | undefined, filters: CCTestFilters = {}) {
  return useQuery<AggregatedTestListResponse, Error>({
    queryKey: ['cc-tests', endpoint, filters],
    queryFn: () => {
      if (!endpoint) throw new Error('No Control Center endpoint configured');
      return fetchCCTests(endpoint, filters);
    },
    enabled: !!endpoint,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch test detail from Control Center
 */
export function useCCTestDetail(endpoint: string | undefined, runId: string | undefined) {
  return useQuery<AggregatedTestDetail, Error>({
    queryKey: ['cc-test-detail', endpoint, runId],
    queryFn: () => {
      if (!endpoint) throw new Error('No Control Center endpoint configured');
      if (!runId) throw new Error('No run ID provided');
      return fetchCCTestDetail(endpoint, runId);
    },
    enabled: !!endpoint && !!runId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch Control Center health
 */
export function useCCHealth(endpoint: string | undefined) {
  return useQuery<CCHealthResponse, Error>({
    queryKey: ['cc-health', endpoint],
    queryFn: () => {
      if (!endpoint) throw new Error('No Control Center endpoint configured');
      return fetchCCHealth(endpoint);
    },
    enabled: !!endpoint,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch GitHub workflow queue status from Control Center
 */
export function useCCGitHubQueue(endpoint: string | undefined) {
  return useQuery<GitHubQueueResponse, Error>({
    queryKey: ['cc-github-queue', endpoint],
    queryFn: () => {
      if (!endpoint) throw new Error('No Control Center endpoint configured');
      return fetchCCGitHubQueue(endpoint);
    },
    enabled: !!endpoint,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}
