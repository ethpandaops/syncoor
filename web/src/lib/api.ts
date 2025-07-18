import { Directory } from '../types/config';
import { ReportIndex, ProgressEntry, TestReport } from '../types/report';

/**
 * Default headers for fetch requests
 */
const DEFAULT_HEADERS: HeadersInit = {
  'Accept': 'application/json',
};

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
};

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    public readonly url?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Performs a fetch with retry logic
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @returns The response
 */
async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
  let lastError: Error | undefined;
  let delay = RETRY_CONFIG.initialDelay;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...DEFAULT_HEADERS,
          ...options?.headers,
        },
        // Add timeout
        signal: options?.signal || AbortSignal.timeout(30000),
      });

      // Return immediately if successful
      if (response.ok) {
        return response;
      }

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new ApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response.statusText,
          url
        );
      }

      // Server error - will retry
      lastError = new ApiError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        response.statusText,
        url
      );
    } catch (error) {
      // Network error or timeout
      lastError = error instanceof Error ? error : new Error('Unknown error');
    }

    // Don't wait after the last attempt
    if (attempt < RETRY_CONFIG.maxRetries) {
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * RETRY_CONFIG.backoffFactor, RETRY_CONFIG.maxDelay);
    }
  }

  throw lastError || new ApiError('Failed to fetch after retries', undefined, undefined, url);
}

/**
 * Constructs a full URL from a directory and path
 * @param directory - The directory configuration
 * @param path - The path to append
 * @returns The full URL
 */
function buildUrl(directory: Directory, path: string): string {
  const baseUrl = directory.url.endsWith('/') ? directory.url : `${directory.url}/`;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Fetches the report index from a directory
 * @param directory - The directory to fetch from
 * @returns The report index
 * @throws ApiError if the fetch fails
 */
export async function fetchIndex(directory: Directory): Promise<ReportIndex> {
  const url = buildUrl(directory, 'index.json');
  
  try {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    
    // Basic validation
    if (!data || typeof data !== 'object') {
      throw new ApiError('Invalid index data: expected object', undefined, undefined, url);
    }
    
    if (!Array.isArray(data.entries)) {
      throw new ApiError('Invalid index data: entries must be an array', undefined, undefined, url);
    }
    
    return data as ReportIndex;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Failed to fetch index from ${directory.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url
    );
  }
}

/**
 * Fetches progress data from a directory
 * @param directory - The directory to fetch from
 * @param filename - The progress file name
 * @returns Array of progress entries
 * @throws ApiError if the fetch fails
 */
export async function fetchProgress(directory: Directory, filename: string): Promise<ProgressEntry[]> {
  const url = buildUrl(directory, filename);
  
  try {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    
    // Validate it's an array
    if (!Array.isArray(data)) {
      throw new ApiError('Invalid progress data: expected array', undefined, undefined, url);
    }
    
    // Basic validation of entries
    for (let i = 0; i < Math.min(data.length, 5); i++) {
      const entry = data[i];
      if (typeof entry !== 'object' || entry === null) {
        throw new ApiError(`Invalid progress entry at index ${i}: expected object`, undefined, undefined, url);
      }
      
      // Check required fields
      const requiredFields = ['t', 'b', 's', 'de', 'dc', 'pe', 'pc'];
      for (const field of requiredFields) {
        if (typeof entry[field] !== 'number') {
          throw new ApiError(
            `Invalid progress entry at index ${i}: field '${field}' must be a number`,
            undefined,
            undefined,
            url
          );
        }
      }
    }
    
    return data as ProgressEntry[];
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Failed to fetch progress from ${directory.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url
    );
  }
}

/**
 * Fetches the main report from a directory
 * @param directory - The directory to fetch from
 * @param filename - The main report file name
 * @returns The test report
 * @throws ApiError if the fetch fails
 */
export async function fetchMainReport(directory: Directory, filename: string): Promise<TestReport> {
  const url = buildUrl(directory, filename);
  
  try {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    
    // Basic validation
    if (!data || typeof data !== 'object') {
      throw new ApiError('Invalid report data: expected object', undefined, undefined, url);
    }
    
    // Check required fields
    const requiredFields = ['run_id', 'timestamp', 'execution_client', 'consensus_client', 'sync_info'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new ApiError(`Invalid report data: missing required field '${field}'`, undefined, undefined, url);
      }
    }
    
    // Validate client info objects
    if (typeof data.execution_client !== 'object' || data.execution_client === null) {
      throw new ApiError('Invalid report data: execution_client must be an object', undefined, undefined, url);
    }
    
    if (typeof data.consensus_client !== 'object' || data.consensus_client === null) {
      throw new ApiError('Invalid report data: consensus_client must be an object', undefined, undefined, url);
    }
    
    return data as TestReport;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Failed to fetch report from ${directory.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url
    );
  }
}