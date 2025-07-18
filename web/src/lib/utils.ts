import { ClientInfo, ProgressEntry } from '../types/report';
import { clsx, type ClassValue } from 'clsx';

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