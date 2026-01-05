import {
  CCApiResponse,
  CCStatusResponse,
  InstanceListResponse,
  AggregatedTestListResponse,
  AggregatedTestDetail,
  CCHealthResponse,
  CCTestFilters,
  GitHubQueueResponse,
} from '../types/controlCenter';

/**
 * Default headers for Control Center API requests
 */
const DEFAULT_HEADERS: HeadersInit = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

/**
 * Retry configuration for Control Center API
 */
const RETRY_CONFIG = {
  maxRetries: 2,
  initialDelay: 500,
  maxDelay: 2000,
  backoffFactor: 2,
};

/**
 * Custom error class for Control Center API errors
 */
export class ControlCenterApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    public readonly url?: string
  ) {
    super(message);
    this.name = 'ControlCenterApiError';
  }
}

/**
 * Performs a fetch with retry logic for Control Center API
 */
async function ccFetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
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
        signal: options?.signal || AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return response;
      }

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new ControlCenterApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response.statusText,
          url
        );
      }

      // Server error - will retry
      lastError = new ControlCenterApiError(
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

  throw lastError || new ControlCenterApiError('Failed to fetch after retries', undefined, undefined, url);
}

/**
 * Constructs a full URL from endpoint and path
 */
function buildUrl(endpoint: string, path: string): string {
  const baseUrl = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Builds query string from filters
 */
function buildQueryString(filters: CCTestFilters): string {
  const params = new URLSearchParams();

  if (filters.active !== undefined) {
    params.set('active', filters.active.toString());
  }
  if (filters.instance) {
    params.set('instance', filters.instance);
  }
  if (filters.network) {
    params.set('network', filters.network);
  }
  if (filters.el_client) {
    params.set('el_client', filters.el_client);
  }
  if (filters.cl_client) {
    params.set('cl_client', filters.cl_client);
  }
  if (filters.sort_by) {
    params.set('sort_by', filters.sort_by);
  }
  if (filters.sort_order) {
    params.set('sort_order', filters.sort_order);
  }
  if (filters.page !== undefined) {
    params.set('page', filters.page.toString());
  }
  if (filters.page_size !== undefined) {
    params.set('page_size', filters.page_size.toString());
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Fetches Control Center status
 */
export async function fetchCCStatus(endpoint: string): Promise<CCStatusResponse> {
  const url = buildUrl(endpoint, '/api/v1/cc/status');

  try {
    const response = await ccFetchWithRetry(url);
    const apiResponse: CCApiResponse<CCStatusResponse> = await response.json();

    if (apiResponse.error) {
      throw new ControlCenterApiError(
        `API error: ${apiResponse.error.message}`,
        undefined,
        undefined,
        url
      );
    }

    if (!apiResponse.data || typeof apiResponse.data !== 'object') {
      throw new ControlCenterApiError('Invalid status data: expected object', undefined, undefined, url);
    }

    return apiResponse.data;
  } catch (error) {
    if (error instanceof ControlCenterApiError) {
      throw error;
    }
    throw new ControlCenterApiError(
      `Failed to fetch CC status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url
    );
  }
}

/**
 * Fetches Control Center instances
 */
export async function fetchCCInstances(endpoint: string): Promise<InstanceListResponse> {
  const url = buildUrl(endpoint, '/api/v1/cc/instances');

  try {
    const response = await ccFetchWithRetry(url);
    const apiResponse: CCApiResponse<InstanceListResponse> = await response.json();

    if (apiResponse.error) {
      throw new ControlCenterApiError(
        `API error: ${apiResponse.error.message}`,
        undefined,
        undefined,
        url
      );
    }

    if (!apiResponse.data || typeof apiResponse.data !== 'object') {
      throw new ControlCenterApiError('Invalid instances data: expected object', undefined, undefined, url);
    }

    return apiResponse.data;
  } catch (error) {
    if (error instanceof ControlCenterApiError) {
      throw error;
    }
    throw new ControlCenterApiError(
      `Failed to fetch CC instances: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url
    );
  }
}

/**
 * Fetches aggregated tests from Control Center
 */
export async function fetchCCTests(
  endpoint: string,
  filters: CCTestFilters = {}
): Promise<AggregatedTestListResponse> {
  const queryString = buildQueryString(filters);
  const url = buildUrl(endpoint, `/api/v1/cc/tests${queryString}`);

  try {
    const response = await ccFetchWithRetry(url);
    const apiResponse: CCApiResponse<AggregatedTestListResponse> = await response.json();

    if (apiResponse.error) {
      throw new ControlCenterApiError(
        `API error: ${apiResponse.error.message}`,
        undefined,
        undefined,
        url
      );
    }

    if (!apiResponse.data || typeof apiResponse.data !== 'object') {
      throw new ControlCenterApiError('Invalid tests data: expected object', undefined, undefined, url);
    }

    if (!Array.isArray(apiResponse.data.tests)) {
      throw new ControlCenterApiError('Invalid tests data: tests must be an array', undefined, undefined, url);
    }

    return apiResponse.data;
  } catch (error) {
    if (error instanceof ControlCenterApiError) {
      throw error;
    }
    throw new ControlCenterApiError(
      `Failed to fetch CC tests: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url
    );
  }
}

/**
 * Fetches test detail from Control Center
 */
export async function fetchCCTestDetail(
  endpoint: string,
  runId: string
): Promise<AggregatedTestDetail> {
  const url = buildUrl(endpoint, `/api/v1/cc/tests/${runId}`);

  try {
    const response = await ccFetchWithRetry(url);
    const apiResponse: CCApiResponse<AggregatedTestDetail> = await response.json();

    if (apiResponse.error) {
      throw new ControlCenterApiError(
        `API error: ${apiResponse.error.message}`,
        undefined,
        undefined,
        url
      );
    }

    if (!apiResponse.data || typeof apiResponse.data !== 'object') {
      throw new ControlCenterApiError('Invalid test detail data: expected object', undefined, undefined, url);
    }

    return apiResponse.data;
  } catch (error) {
    if (error instanceof ControlCenterApiError) {
      throw error;
    }
    throw new ControlCenterApiError(
      `Failed to fetch CC test detail: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url
    );
  }
}

/**
 * Fetches Control Center health
 */
export async function fetchCCHealth(endpoint: string): Promise<CCHealthResponse> {
  const url = buildUrl(endpoint, '/health');

  try {
    const response = await ccFetchWithRetry(url);
    const data: CCHealthResponse = await response.json();

    if (!data || typeof data !== 'object') {
      throw new ControlCenterApiError('Invalid health data: expected object', undefined, undefined, url);
    }

    return data;
  } catch (error) {
    if (error instanceof ControlCenterApiError) {
      throw error;
    }
    throw new ControlCenterApiError(
      `Failed to fetch CC health: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url
    );
  }
}

/**
 * Fetches GitHub workflow queue status from Control Center
 */
export async function fetchCCGitHubQueue(endpoint: string): Promise<GitHubQueueResponse> {
  const url = buildUrl(endpoint, '/api/v1/cc/github/queue');

  try {
    const response = await ccFetchWithRetry(url);
    const apiResponse: CCApiResponse<GitHubQueueResponse> = await response.json();

    if (apiResponse.error) {
      throw new ControlCenterApiError(
        `API error: ${apiResponse.error.message}`,
        undefined,
        undefined,
        url
      );
    }

    if (!apiResponse.data || typeof apiResponse.data !== 'object') {
      throw new ControlCenterApiError('Invalid GitHub queue data: expected object', undefined, undefined, url);
    }

    return apiResponse.data;
  } catch (error) {
    if (error instanceof ControlCenterApiError) {
      throw error;
    }
    throw new ControlCenterApiError(
      `Failed to fetch GitHub queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url
    );
  }
}
