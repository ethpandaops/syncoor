import { useQuery } from '@tanstack/react-query';
import { ProgressEntry } from '../types/report';

interface UseProgressDataParams {
  progressUrl: string;
  enabled?: boolean;
}

/**
 * Hook to fetch progress data from a progress.json file
 * @param params - Parameters including the progress file URL and enabled flag
 * @returns Query result with progress data
 */
export function useProgressData({ progressUrl, enabled = true }: UseProgressDataParams) {
  return useQuery<ProgressEntry[], Error>({
    queryKey: ['progress', progressUrl],
    queryFn: async () => {
      const response = await fetch(progressUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch progress data: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Validate that it's an array
      if (!Array.isArray(data)) {
        throw new Error('Invalid progress data: expected array');
      }
      
      // Basic validation of entries
      for (let i = 0; i < Math.min(data.length, 5); i++) {
        const entry = data[i];
        if (typeof entry !== 'object' || entry === null) {
          throw new Error(`Invalid progress entry at index ${i}: expected object`);
        }
        
        // Check required fields
        const requiredFields = ['t', 'b', 's', 'de', 'dc', 'pe', 'pc'];
        for (const field of requiredFields) {
          if (typeof entry[field] !== 'number') {
            throw new Error(
              `Invalid progress entry at index ${i}: field '${field}' must be a number`
            );
          }
        }
      }
      
      return data as ProgressEntry[];
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