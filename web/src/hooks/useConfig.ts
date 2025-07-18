import { useQuery } from '@tanstack/react-query';
import { loadConfig } from '../lib/config';
import { Config } from '../types/config';

/**
 * Hook to load and cache configuration using Tanstack Query
 * @returns Object containing config data, loading state, error state, and refetch function
 */
export function useConfig() {
  return useQuery<Config, Error>({
    queryKey: ['config'],
    queryFn: loadConfig,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}