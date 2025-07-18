import { useQuery } from '@tanstack/react-query';
import { fetchMainReport, fetchProgress } from '../lib/api';
import { Directory } from '../types/config';
import { TestReport, ProgressEntry } from '../types/report';

/**
 * Parameters for the useTestDetails hook
 */
export interface UseTestDetailsParams {
  /** Directory to fetch from */
  directory: Directory;
  /** Run ID of the test */
  runId: string;
  /** Main report filename */
  mainFile: string;
  /** Progress file filename */
  progressFile: string;
}

/**
 * Computed metrics from test data
 */
export interface ComputedMetrics {
  /** Average sync rate in blocks per second */
  averageBlocksPerSecond: number;
  /** Average sync rate in slots per second */
  averageSlotsPerSecond: number;
  /** Peak sync rate in blocks per second */
  peakBlocksPerSecond: number;
  /** Peak sync rate in slots per second */
  peakSlotsPerSecond: number;
  /** Final execution database size in bytes */
  finalExecutionDbSize: number;
  /** Final consensus database size in bytes */
  finalConsensusDbSize: number;
  /** Total database size in bytes */
  totalDbSize: number;
  /** Average execution peers */
  averageExecutionPeers: number;
  /** Average consensus peers */
  averageConsensusPeers: number;
  /** Progress percentage (0-100) */
  progressPercentage: number;
  /** Estimated completion time (if running) */
  estimatedCompletion?: Date;
}

/**
 * Combined test details with main report and progress data
 */
export interface TestDetails {
  /** Main test report */
  report: TestReport;
  /** Progress entries */
  progress: ProgressEntry[];
  /** Computed metrics */
  metrics: ComputedMetrics;
}

/**
 * Hook result for test details
 */
export interface UseTestDetailsResult {
  /** Test details data */
  data: TestDetails | undefined;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Computes metrics from progress data and test report
 */
function computeMetrics(report: TestReport, progress: ProgressEntry[]): ComputedMetrics {
  if (progress.length === 0) {
    return {
      averageBlocksPerSecond: 0,
      averageSlotsPerSecond: 0,
      peakBlocksPerSecond: 0,
      peakSlotsPerSecond: 0,
      finalExecutionDbSize: 0,
      finalConsensusDbSize: 0,
      totalDbSize: 0,
      averageExecutionPeers: 0,
      averageConsensusPeers: 0,
      progressPercentage: 0,
    };
  }
  
  // Sort progress by timestamp
  const sortedProgress = [...progress].sort((a, b) => a.t - b.t);
  const lastEntry = sortedProgress[sortedProgress.length - 1];
  
  // Calculate sync rates
  const blockRates: number[] = [];
  const slotRates: number[] = [];
  
  for (let i = 1; i < sortedProgress.length; i++) {
    const prev = sortedProgress[i - 1];
    const curr = sortedProgress[i];
    const timeDiff = (curr.t - prev.t) / 1000; // Convert to seconds
    
    if (timeDiff > 0) {
      const blockRate = (curr.b - prev.b) / timeDiff;
      const slotRate = (curr.s - prev.s) / timeDiff;
      
      if (blockRate > 0) blockRates.push(blockRate);
      if (slotRate > 0) slotRates.push(slotRate);
    }
  }
  
  // Calculate averages
  const averageBlocksPerSecond = blockRates.length > 0 
    ? blockRates.reduce((sum, rate) => sum + rate, 0) / blockRates.length 
    : 0;
  const averageSlotsPerSecond = slotRates.length > 0 
    ? slotRates.reduce((sum, rate) => sum + rate, 0) / slotRates.length 
    : 0;
  
  // Calculate peaks
  const peakBlocksPerSecond = blockRates.length > 0 ? Math.max(...blockRates) : 0;
  const peakSlotsPerSecond = slotRates.length > 0 ? Math.max(...slotRates) : 0;
  
  // Calculate peer averages
  const averageExecutionPeers = sortedProgress.reduce((sum, entry) => sum + entry.pe, 0) / sortedProgress.length;
  const averageConsensusPeers = sortedProgress.reduce((sum, entry) => sum + entry.pc, 0) / sortedProgress.length;
  
  // Get final database sizes
  const finalExecutionDbSize = lastEntry.de;
  const finalConsensusDbSize = lastEntry.dc;
  const totalDbSize = finalExecutionDbSize + finalConsensusDbSize;
  
  // Calculate progress percentage
  const targetBlock = report.sync_info.block;
  const targetSlot = report.sync_info.slot;
  const currentBlock = lastEntry.b;
  const currentSlot = lastEntry.s;
  
  // Use the higher of block or slot progress
  const blockProgress = targetBlock > 0 ? (currentBlock / targetBlock) * 100 : 0;
  const slotProgress = targetSlot > 0 ? (currentSlot / targetSlot) * 100 : 0;
  const progressPercentage = Math.min(100, Math.max(blockProgress, slotProgress));
  
  // Estimate completion time if still running
  let estimatedCompletion: Date | undefined;
  if (report.status === 'running' && averageBlocksPerSecond > 0) {
    const remainingBlocks = Math.max(0, targetBlock - currentBlock);
    const remainingSeconds = remainingBlocks / averageBlocksPerSecond;
    estimatedCompletion = new Date(Date.now() + remainingSeconds * 1000);
  }
  
  return {
    averageBlocksPerSecond,
    averageSlotsPerSecond,
    peakBlocksPerSecond,
    peakSlotsPerSecond,
    finalExecutionDbSize,
    finalConsensusDbSize,
    totalDbSize,
    averageExecutionPeers,
    averageConsensusPeers,
    progressPercentage,
    estimatedCompletion,
  };
}

/**
 * Hook to load main report and progress data for a specific test
 * @param params - Directory, run ID, and file names
 * @returns Test details with computed metrics, loading state, and error handling
 */
export function useTestDetails(params: UseTestDetailsParams): UseTestDetailsResult {
  const { directory, runId, mainFile, progressFile } = params;
  
  const query = useQuery({
    queryKey: ['testDetails', directory.url, runId, mainFile, progressFile],
    queryFn: async () => {
      // Fetch both main report and progress data concurrently
      const [report, progress] = await Promise.all([
        fetchMainReport(directory, mainFile),
        fetchProgress(directory, progressFile),
      ]);
      
      // Compute metrics
      const metrics = computeMetrics(report, progress);
      
      return {
        report,
        progress,
        metrics,
      };
    },
    enabled: !!(directory && runId && mainFile && progressFile),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    // Refetch more frequently if test is still running
    // refetchInterval: (data) => {
    //   if (data?.report?.status === 'running') {
    //     return 15 * 1000; // 15 seconds for running tests
    //   }
    //   return false; // Don't refetch completed tests
    // },
  });
  
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}