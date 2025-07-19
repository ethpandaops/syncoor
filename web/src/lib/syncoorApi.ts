import { SyncoorApiEndpoint } from '../types/config';
import { 
  SyncoorApiResponse, 
  TestListResponse, 
  TestDetail, 
  HealthResponse 
} from '../types/syncoor';

/**
 * Default headers for syncoor API requests
 */
const DEFAULT_HEADERS: HeadersInit = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

/**
 * Retry configuration for syncoor API
 */
const RETRY_CONFIG = {
  maxRetries: 2,
  initialDelay: 500,
  maxDelay: 2000,
  backoffFactor: 2,
};

/**
 * Custom error class for Syncoor API errors
 */
export class SyncoorApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    public readonly url?: string,
    public readonly endpoint?: string
  ) {
    super(message);
    this.name = 'SyncoorApiError';
  }
}

/**
 * Performs a fetch with retry logic for syncoor API
 */
async function syncoorFetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
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
        signal: options?.signal || AbortSignal.timeout(10000),
      });

      // Return immediately if successful
      if (response.ok) {
        return response;
      }

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new SyncoorApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response.statusText,
          url
        );
      }

      // Server error - will retry
      lastError = new SyncoorApiError(
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

  throw lastError || new SyncoorApiError('Failed to fetch after retries', undefined, undefined, url);
}

/**
 * Constructs a full URL from an endpoint and path
 */
function buildSyncoorUrl(endpoint: SyncoorApiEndpoint, path: string): string {
  const baseUrl = endpoint.url.endsWith('/') ? endpoint.url.slice(0, -1) : endpoint.url;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Fetches test list from a syncoor endpoint
 */
export async function fetchSyncoorTests(endpoint: SyncoorApiEndpoint): Promise<TestListResponse> {
  const url = buildSyncoorUrl(endpoint, '/api/v1/tests');
  
  try {
    const response = await syncoorFetchWithRetry(url);
    const apiResponse: SyncoorApiResponse<TestListResponse> = await response.json();
    
    if (apiResponse.error) {
      throw new SyncoorApiError(
        `API error: ${apiResponse.error.message}`,
        undefined,
        undefined,
        url,
        endpoint.name
      );
    }
    
    // Basic validation
    if (!apiResponse.data || typeof apiResponse.data !== 'object') {
      throw new SyncoorApiError('Invalid test list data: expected object', undefined, undefined, url, endpoint.name);
    }
    
    if (!Array.isArray(apiResponse.data.tests)) {
      throw new SyncoorApiError('Invalid test list data: tests must be an array', undefined, undefined, url, endpoint.name);
    }
    
    return apiResponse.data;
  } catch (error) {
    if (error instanceof SyncoorApiError) {
      throw error;
    }
    throw new SyncoorApiError(
      `Failed to fetch tests from ${endpoint.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url,
      endpoint.name
    );
  }
}

/**
 * Fetches detailed test information from a syncoor endpoint
 */
export async function fetchSyncoorTestDetail(endpoint: SyncoorApiEndpoint, runId: string): Promise<TestDetail> {
  const url = buildSyncoorUrl(endpoint, `/api/v1/tests/${runId}`);
  
  try {
    const response = await syncoorFetchWithRetry(url);
    const apiResponse: SyncoorApiResponse<TestDetail> = await response.json();
    
    if (apiResponse.error) {
      throw new SyncoorApiError(
        `API error: ${apiResponse.error.message}`,
        undefined,
        undefined,
        url,
        endpoint.name
      );
    }
    
    // Basic validation
    if (!apiResponse.data || typeof apiResponse.data !== 'object') {
      throw new SyncoorApiError('Invalid test detail data: expected object', undefined, undefined, url, endpoint.name);
    }
    
    return apiResponse.data;
  } catch (error) {
    if (error instanceof SyncoorApiError) {
      throw error;
    }
    throw new SyncoorApiError(
      `Failed to fetch test detail from ${endpoint.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url,
      endpoint.name
    );
  }
}

/**
 * Fetches health information from a syncoor endpoint
 */
export async function fetchSyncoorHealth(endpoint: SyncoorApiEndpoint): Promise<HealthResponse> {
  const url = buildSyncoorUrl(endpoint, '/health');
  
  try {
    const response = await syncoorFetchWithRetry(url);
    const apiResponse: SyncoorApiResponse<HealthResponse> = await response.json();
    
    if (apiResponse.error) {
      throw new SyncoorApiError(
        `API error: ${apiResponse.error.message}`,
        undefined,
        undefined,
        url,
        endpoint.name
      );
    }
    
    // Basic validation
    if (!apiResponse.data || typeof apiResponse.data !== 'object') {
      throw new SyncoorApiError('Invalid health data: expected object', undefined, undefined, url, endpoint.name);
    }
    
    return apiResponse.data;
  } catch (error) {
    if (error instanceof SyncoorApiError) {
      throw error;
    }
    throw new SyncoorApiError(
      `Failed to fetch health from ${endpoint.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url,
      endpoint.name
    );
  }
}