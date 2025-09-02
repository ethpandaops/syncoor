import { ClientInfo, ProgressEntry } from '../types/report';
import { clsx, type ClassValue } from 'clsx';
import React from 'react';

/**
 * Utility function to merge class names with clsx
 * @param inputs - Class names to merge
 * @returns Merged class names
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Formats a duration in seconds to a human-readable string
 * @param seconds - The duration in seconds
 * @returns A formatted string like "1h 23m 45s"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) {
    return 'Invalid duration';
  }

  if (seconds === 0) {
    return '0s';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs}s`);
  }

  return parts.join(' ');
}

/**
 * Formats bytes to a human-readable string
 * @param bytes - The number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns A formatted string like "1.23 GB"
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes < 0) {
    return 'Invalid size';
  }

  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = i >= sizes.length ? sizes.length - 1 : i;

  return `${(bytes / Math.pow(k, size)).toFixed(dm)} ${sizes[size]}`;
}

/**
 * Calculates the sync rate (blocks per second) from progress entries
 * @param entries - Array of progress entries
 * @returns The average blocks per second, or 0 if cannot be calculated
 */
export function calculateSyncRate(entries: ProgressEntry[]): number {
  if (!entries || entries.length < 2) {
    return 0;
  }

  // Sort entries by timestamp to ensure correct order
  const sortedEntries = [...entries].sort((a, b) => a.t - b.t);

  // Find the first and last entries with actual block progress
  let firstEntry: ProgressEntry | null = null;
  let lastEntry: ProgressEntry | null = null;

  for (const entry of sortedEntries) {
    if (entry.b > 0) {
      if (!firstEntry) {
        firstEntry = entry;
      }
      lastEntry = entry;
    }
  }

  if (!firstEntry || !lastEntry || firstEntry === lastEntry) {
    return 0;
  }

  const blockDiff = lastEntry.b - firstEntry.b;
  const timeDiff = lastEntry.t - firstEntry.t;

  if (timeDiff <= 0 || blockDiff <= 0) {
    return 0;
  }

  // Return blocks per second
  return blockDiff / timeDiff;
}

/**
 * Gets a display name for a client
 * @param info - The client information
 * @returns A formatted display name
 */
export function getClientDisplayName(info: ClientInfo): string {
  if (!info) {
    return 'Unknown Client';
  }

  // Extract meaningful name from the client name or type
  const name = info.type || info.name || 'Unknown';
  
  // Common client type mappings
  const clientMappings: Record<string, string> = {
    'geth': 'Geth',
    'nethermind': 'Nethermind',
    'besu': 'Besu',
    'erigon': 'Erigon',
    'prysm': 'Prysm',
    'lighthouse': 'Lighthouse',
    'teku': 'Teku',
    'nimbus': 'Nimbus',
    'lodestar': 'Lodestar',
    'grandine': 'Grandine',
  };

  // Check if we have a known client type
  const lowerName = name.toLowerCase();
  for (const [key, displayName] of Object.entries(clientMappings)) {
    if (lowerName.includes(key)) {
      // If we have version info, append it
      if (info.version) {
        const versionMatch = info.version.match(/v?(\d+\.\d+\.\d+)/);
        if (versionMatch) {
          return `${displayName} ${versionMatch[1]}`;
        }
      }
      return displayName;
    }
  }

  // Fallback: capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Formats a timestamp to a readable date string
 * @param timestamp - Unix timestamp (seconds)
 * @returns Formatted date string
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

/**
 * Calculates the progress percentage
 * @param current - Current value
 * @param target - Target value
 * @returns Percentage (0-100)
 */
export function calculateProgress(current: number, target: number): number {
  if (target <= 0 || current < 0) {
    return 0;
  }
  
  if (current >= target) {
    return 100;
  }
  
  return Math.round((current / target) * 100);
}

/**
 * Groups progress entries by time intervals
 * @param entries - Array of progress entries
 * @param intervalSeconds - Interval in seconds (default: 60)
 * @returns Grouped entries with averages
 */
export function groupProgressByInterval(
  entries: ProgressEntry[],
  intervalSeconds: number = 60
): ProgressEntry[] {
  if (!entries || entries.length === 0) {
    return [];
  }

  const grouped = new Map<number, ProgressEntry[]>();

  for (const entry of entries) {
    const intervalKey = Math.floor(entry.t / intervalSeconds) * intervalSeconds;
    
    if (!grouped.has(intervalKey)) {
      grouped.set(intervalKey, []);
    }
    
    grouped.get(intervalKey)!.push(entry);
  }

  // Calculate averages for each interval
  const result: ProgressEntry[] = [];
  
  for (const [timestamp, groupEntries] of grouped) {
    const count = groupEntries.length;
    
    const avgEntry: ProgressEntry = {
      t: timestamp,
      b: Math.round(groupEntries.reduce((sum, e) => sum + e.b, 0) / count),
      s: Math.round(groupEntries.reduce((sum, e) => sum + e.s, 0) / count),
      de: Math.round(groupEntries.reduce((sum, e) => sum + e.de, 0) / count),
      dc: Math.round(groupEntries.reduce((sum, e) => sum + e.dc, 0) / count),
      pe: Math.round(groupEntries.reduce((sum, e) => sum + e.pe, 0) / count),
      pc: Math.round(groupEntries.reduce((sum, e) => sum + e.pc, 0) / count),
    };
    
    result.push(avgEntry);
  }

  return result.sort((a, b) => a.t - b.t);
}

/**
 * Groups reports by directory, then by network, then by execution client type
 * @param reports - Array of reports to group
 * @returns Grouped reports structure
 */
export function groupReportsByDirectoryNetworkAndClient<T extends { 
  source_directory: string; 
  network: string; 
  execution_client_info: { type: string } 
}>(
  reports: T[]
): Record<string, Record<string, Record<string, T[]>>> {
  const grouped: Record<string, Record<string, Record<string, T[]>>> = {};

  for (const report of reports) {
    const directory = report.source_directory;
    const network = report.network;
    const clientType = report.execution_client_info.type;

    if (!grouped[directory]) {
      grouped[directory] = {};
    }

    if (!grouped[directory][network]) {
      grouped[directory][network] = {};
    }

    if (!grouped[directory][network][clientType]) {
      grouped[directory][network][clientType] = [];
    }

    grouped[directory][network][clientType].push(report);
  }

  return grouped;
}

/**
 * Groups reports by network and then by execution client type (legacy function)
 * @param reports - Array of reports to group
 * @returns Grouped reports structure
 */
export function groupReportsByNetworkAndClient<T extends { network: string; execution_client_info: { type: string } }>(
  reports: T[]
): Record<string, Record<string, T[]>> {
  const grouped: Record<string, Record<string, T[]>> = {};

  for (const report of reports) {
    const network = report.network;
    const clientType = report.execution_client_info.type;

    if (!grouped[network]) {
      grouped[network] = {};
    }

    if (!grouped[network][clientType]) {
      grouped[network][clientType] = [];
    }

    grouped[network][clientType].push(report);
  }

  return grouped;
}

/**
 * Gets unique networks from reports
 * @param reports - Array of reports
 * @returns Array of unique network names
 */
export function getUniqueNetworks<T extends { network: string }>(reports: T[]): string[] {
  const networks = new Set(reports.map(report => report.network));
  return Array.from(networks).sort();
}

/**
 * Gets unique execution client types from reports
 * @param reports - Array of reports
 * @returns Array of unique execution client types
 */
export function getUniqueExecutionClients<T extends { execution_client_info: { type: string } }>(reports: T[]): string[] {
  const clientTypes = new Set(reports.map(report => report.execution_client_info.type));
  return Array.from(clientTypes).sort();
}

/**
 * Gets unique consensus client types from reports
 * @param reports - Array of reports
 * @returns Array of unique consensus client types
 */
export function getUniqueConsensusClients<T extends { consensus_client_info: { type: string } }>(reports: T[]): string[] {
  const clientTypes = new Set(reports.map(report => report.consensus_client_info.type));
  return Array.from(clientTypes).sort();
}

/**
 * Calculates optimal moving average window size based on data length
 * @param dataLength - Number of data points
 * @returns Optimal window size
 */
export function getOptimalMovingAverageWindow(dataLength: number): number {
  if (dataLength < 5) return Math.max(3, dataLength);
  if (dataLength < 20) return 5;
  if (dataLength < 50) return 10;
  if (dataLength < 100) return 15;
  if (dataLength < 200) return 20;
  return Math.min(30, Math.floor(dataLength * 0.15)); // 15% of data points, max 30
}

/**
 * Calculates confidence bands for a dataset
 * @param data - Array of data points with numeric values
 * @param valueKey - Key to extract numeric value from each data point
 * @param windowSize - Window size for calculation
 * @param confidenceLevel - Confidence level (default: 0.95 for 95%)
 * @returns Array of data points with confidence bands
 */
export function calculateConfidenceBands<T extends Record<string, string | number>>(
  data: T[],
  valueKey: keyof T,
  windowSize?: number,
  confidenceLevel: number = 0.95
): (T & { movingAverage: number; upperBand: number; lowerBand: number; stdDev: number })[] {
  if (!data || data.length === 0) return [];
  
  // Use provided window size or calculate optimal size
  const effectiveWindowSize = windowSize ?? getOptimalMovingAverageWindow(data.length);
  
  // Z-score for confidence level (95% = 1.96, 90% = 1.645, 99% = 2.576)
  const zScore = confidenceLevel === 0.95 ? 1.96 : 
                 confidenceLevel === 0.90 ? 1.645 :
                 confidenceLevel === 0.99 ? 2.576 : 1.96;
  
  return data.map((point, index) => {
    // Calculate the start index for the window
    const start = Math.max(0, index - Math.floor(effectiveWindowSize / 2));
    // Calculate the end index for the window
    const end = Math.min(data.length, start + effectiveWindowSize);
    
    // Extract values for the window
    const windowValues = data.slice(start, end).map(p => Number(p[valueKey])).filter(v => !isNaN(v));
    
    if (windowValues.length === 0) {
      const value = Number(point[valueKey]);
      return {
        ...point,
        movingAverage: value,
        upperBand: value,
        lowerBand: value,
        stdDev: 0
      };
    }
    
    // Calculate average
    const average = windowValues.reduce((sum, val) => sum + val, 0) / windowValues.length;
    
    // Calculate standard deviation
    const variance = windowValues.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / windowValues.length;
    const stdDev = Math.sqrt(variance);
    
    // Calculate standard error of the mean
    const standardError = stdDev / Math.sqrt(windowValues.length);
    
    // Calculate confidence bands
    const margin = zScore * standardError;
    const upperBand = average + margin;
    const lowerBand = Math.max(0, average - margin); // Ensure lower band doesn't go negative
    
    return {
      ...point,
      movingAverage: average,
      upperBand,
      lowerBand,
      stdDev
    };
  });
}

/**
 * Calculates a simple moving average for chart data
 * @param data - Array of data points with numeric values
 * @param valueKey - Key to extract numeric value from each data point
 * @param windowSize - Number of points to include in moving average (default: auto-calculated)
 * @returns Array of data points with moving average values
 */
export function calculateMovingAverage<T extends Record<string, string | number>>(
  data: T[],
  valueKey: keyof T,
  windowSize?: number
): (T & { movingAverage: number })[] {
  if (!data || data.length === 0) return [];
  
  // Use provided window size or calculate optimal size
  const effectiveWindowSize = windowSize ?? getOptimalMovingAverageWindow(data.length);
  
  return data.map((point, index) => {
    // Calculate the start index for the window
    const start = Math.max(0, index - Math.floor(effectiveWindowSize / 2));
    // Calculate the end index for the window
    const end = Math.min(data.length, start + effectiveWindowSize);
    
    // Extract values for the window
    const windowValues = data.slice(start, end).map(p => Number(p[valueKey])).filter(v => !isNaN(v));
    
    // Calculate average
    const average = windowValues.length > 0 
      ? windowValues.reduce((sum, val) => sum + val, 0) / windowValues.length
      : Number(point[valueKey]);
    
    return {
      ...point,
      movingAverage: average
    };
  });
}

/**
 * Calculates stats for a group of test reports
 * @param reports - Array of IndexEntry reports
 * @returns Object with last runtime, trend duration (last moving average), and most recent disk usage
 */
export function calculateClientGroupStats(reports: { timestamp: string | number; sync_info: { status?: string; duration: number; last_entry?: { de?: number } } }[]) {
  if (!reports || reports.length === 0) {
    return {
      lastRuntime: null,
      avgDuration: null,
      mostRecentDiskUsage: null
    };
  }

  // Sort by timestamp (most recent first)
  const sortedReports = [...reports].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  
  // Last runtime (most recent test timestamp)
  const lastRuntime = Number(sortedReports[0].timestamp);
  
  // Filter to only successful runs for duration and disk usage calculations
  const successfulReports = reports.filter(r => {
    const status = r.sync_info.status || 'success'; // Default to success
    return status === 'success';
  });
  
  // Calculate trend duration (last moving average value) - only from successful runs
  let avgDuration = null;
  const validDurations = successfulReports
    .map(r => r.sync_info.duration)
    .filter(d => typeof d === 'number' && d > 0);
  
  if (validDurations.length > 0) {
    if (validDurations.length >= 3) {
      // Sort by timestamp for proper trend calculation
      const sortedByTime = [...successfulReports]
        .filter(r => typeof r.sync_info.duration === 'number' && r.sync_info.duration > 0)
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        .map(r => ({
          timestamp: Number(r.timestamp),
          duration: r.sync_info.duration
        }));
      
      // Calculate moving average with dynamic window size and get the last value
      const withMovingAvg = calculateMovingAverage(sortedByTime, 'duration');
      if (withMovingAvg.length > 0) {
        avgDuration = withMovingAvg[withMovingAvg.length - 1].movingAverage;
      }
    } else {
      // Fallback to simple average if not enough data points
      avgDuration = validDurations.reduce((sum, d) => sum + d, 0) / validDurations.length;
    }
  }
  
  // Most recent disk usage (from most recent successful test with disk data)
  const sortedSuccessfulReports = [...successfulReports].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  const mostRecentWithDisk = sortedSuccessfulReports.find(r => r.sync_info.last_entry?.de);
  const mostRecentDiskUsage = mostRecentWithDisk?.sync_info.last_entry?.de || null;
  
  return {
    lastRuntime,
    avgDuration,
    mostRecentDiskUsage
  };
}

/**
 * Get badge variant and display text for sync status
 * @param status - The sync status
 * @returns Object with variant and display text
 */
export function getStatusBadgeInfo(status?: string): { 
  variant: 'default' | 'secondary' | 'destructive' | 'success' | 'outline' | 'warning';
  text: string;
} {
  if (!status) {
    return { variant: 'success', text: 'Success' };
  }

  switch (status.toLowerCase()) {
    case 'success':
      return { variant: 'success', text: 'Success' };
    case 'timeout':
      return { variant: 'warning', text: 'Timeout' };
    case 'cancelled':
      return { variant: 'secondary', text: 'Cancelled' };
    case 'error':
      return { variant: 'destructive', text: 'Error' };
    default:
      return { variant: 'outline', text: status };
  }
}

/**
 * Get status icon for sync status
 * @param status - The sync status
 * @returns Icon component as JSX element
 */
export function getStatusIcon(status?: string): React.ReactElement | null {
  if (!status) {
    // Default to success icon when status is unknown
    status = 'success';
  }

  switch (status.toLowerCase()) {
    case 'success':
      return React.createElement('svg', {
        className: "w-4 h-4",
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor"
      }, React.createElement('path', {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 2,
        d: "M5 13l4 4L19 7"
      }));
    case 'timeout':
      return React.createElement('svg', {
        className: "w-4 h-4",
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor"
      }, React.createElement('path', {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 2,
        d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      }));
    case 'cancelled':
      return React.createElement('svg', {
        className: "w-4 h-4",
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor"
      }, React.createElement('path', {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 2,
        d: "M6 18L18 6M6 6l12 12"
      }));
    case 'error':
      return React.createElement('svg', {
        className: "w-4 h-4",
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor"
      }, React.createElement('path', {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 2,
        d: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      }));
    default:
      return null;
  }
}