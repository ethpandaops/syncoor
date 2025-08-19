import { Directory } from '../types/config';
import { ReportIndex, ProgressEntry, TestReport, ZipFileInfo } from '../types/report';
import * as zip from '@zip.js/zip.js';

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

/**
 * Checks if a dump.zip file exists for a test run
 * @param sourceUrl - Base URL for the test files
 * @param runId - The test run ID
 * @param network - Network name
 * @param elClient - Execution layer client name
 * @param clClient - Consensus layer client name
 * @returns Promise<boolean> - Whether the dump file exists
 */
export async function checkDumpFileExists(
  sourceUrl: string, 
  runId: string,
  network: string,
  elClient: string,
  clClient: string
): Promise<boolean> {
  const dumpFileName = `${runId}-${network}_${elClient}_${clClient}.main.dump.zip`;
  const url = sourceUrl.endsWith('/') ? `${sourceUrl}${dumpFileName}` : `${sourceUrl}/${dumpFileName}`;
  
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Gets information about a dump.zip file including its file listing
 * Uses zip.js to read the ZIP file contents via HTTP range requests
 * @param sourceUrl - Base URL for the test files  
 * @param runId - The test run ID
 * @param network - Network name
 * @param elClient - Execution layer client name
 * @param clClient - Consensus layer client name
 * @returns Promise<ZipFileInfo> - Information about the ZIP file
 */
export async function getDumpFileInfo(
  sourceUrl: string, 
  runId: string,
  network: string,
  elClient: string,
  clClient: string
): Promise<ZipFileInfo> {
  const dumpFileName = `${runId}-${network}_${elClient}_${clClient}.main.dump.zip`;
  const url = sourceUrl.endsWith('/') ? `${sourceUrl}${dumpFileName}` : `${sourceUrl}/${dumpFileName}`;
  
  let reader: zip.ZipReader<unknown> | null = null;
  
  try {
    // First check if file exists and get size
    const headResponse = await fetch(url, { method: 'HEAD' });
    
    if (!headResponse.ok) {
      return { exists: false, error: `HTTP ${headResponse.status}: ${headResponse.statusText}` };
    }
    
    const sizeHeader = headResponse.headers.get('Content-Length');
    const size = sizeHeader ? parseInt(sizeHeader, 10) : undefined;
    const acceptRanges = headResponse.headers.get('Accept-Ranges');
    
    console.log('Server headers - Accept-Ranges:', acceptRanges, 'Size:', size ? `${Math.round(size / 1024)}KB` : 'unknown');
    
    // Configure zip.js
    zip.configure({
      useWebWorkers: true,
      workerScripts: {
        deflate: ['https://unpkg.com/@zip.js/zip.js@2.7.72/dist/z-worker.js'],
        inflate: ['https://unpkg.com/@zip.js/zip.js@2.7.72/dist/z-worker.js']
      }
    });
    
    let zipEntries;
    
    // Now that CORS is fixed, we can use HttpRangeReader when the server supports it
    if (acceptRanges && acceptRanges !== 'none') {
      try {
        console.log('Using HttpRangeReader for efficient ZIP reading');
        const httpReader = new zip.HttpRangeReader(url);
        reader = new zip.ZipReader(httpReader);
        zipEntries = await reader.getEntries();
        console.log('HttpRangeReader succeeded - efficient reading complete!');
      } catch (error) {
        console.error('HttpRangeReader failed:', error);
        
        // Fallback to full download
        console.log('Falling back to full file download');
        
        // Check file size before downloading
        if (size && size > 100 * 1024 * 1024) { // 100MB limit
          return {
            exists: true,
            size,
            entries: [],
            error: `ZIP file is too large (${Math.round(size / 1024 / 1024)}MB) to list contents. HttpRangeReader failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }
        
        const response = await fetch(url);
        const blob = await response.blob();
        const blobReader = new zip.BlobReader(blob);
        reader = new zip.ZipReader(blobReader);
        zipEntries = await reader.getEntries();
      }
    } else {
      // No range support, download the entire file
      console.log('No range support detected, downloading entire file');
      
      // Check file size before downloading
      if (size && size > 100 * 1024 * 1024) { // 100MB limit
        return {
          exists: true,
          size,
          entries: [],
          error: `ZIP file is too large (${Math.round(size / 1024 / 1024)}MB) to list contents without range support.`
        };
      }
      
      const response = await fetch(url);
      const blob = await response.blob();
      const blobReader = new zip.BlobReader(blob);
      reader = new zip.ZipReader(blobReader);
      zipEntries = await reader.getEntries();
    }
    
    // Convert zip.js entries to our format
    const entries = zipEntries.map(entry => ({
      name: entry.filename,
      size: entry.uncompressedSize,
      compressed_size: entry.compressedSize,
      modified: entry.lastModDate ? entry.lastModDate.toISOString() : new Date().toISOString(),
      is_directory: entry.directory
    }));
    
    // Close the reader
    await reader.close();
    
    return {
      exists: true,
      size,
      entries
    };
  } catch (error) {
    // Clean up reader if it was created
    if (reader) {
      try {
        await reader.close();
      } catch {
        // Ignore close errors
      }
    }
    
    // Check if it's a CORS error
    if (error instanceof Error && error.message.includes('CORS')) {
      // Fallback to placeholder data if CORS blocks the request
      console.warn('CORS blocked ZIP reading, using placeholder data:', error);
      return {
        exists: true,
        size: undefined,
        entries: [
          {
            name: "Note: Real file listing unavailable due to CORS",
            size: 0,
            compressed_size: 0,
            modified: new Date().toISOString(),
            is_directory: false
          }
        ],
        error: "Unable to read ZIP contents due to CORS policy. Download the file to view contents."
      };
    }
    
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Extracts a specific file from a ZIP archive
 * @param sourceUrl - Base URL for the test files
 * @param runId - The test run ID
 * @param network - Network name
 * @param elClient - Execution layer client name
 * @param clClient - Consensus layer client name
 * @param filePath - Path of the file to extract from the ZIP
 * @returns Promise<Blob> - The extracted file as a Blob
 */
export async function extractFileFromDump(
  sourceUrl: string,
  runId: string,
  network: string,
  elClient: string,
  clClient: string,
  filePath: string
): Promise<Blob> {
  const dumpFileName = `${runId}-${network}_${elClient}_${clClient}.main.dump.zip`;
  const url = sourceUrl.endsWith('/') ? `${sourceUrl}${dumpFileName}` : `${sourceUrl}/${dumpFileName}`;
  
  let reader: zip.ZipReader<unknown> | null = null;
  
  try {
    // Configure zip.js
    zip.configure({
      useWebWorkers: true,
      workerScripts: {
        deflate: ['https://unpkg.com/@zip.js/zip.js@2.7.72/dist/z-worker.js'],
        inflate: ['https://unpkg.com/@zip.js/zip.js@2.7.72/dist/z-worker.js']
      }
    });
    
    let entries;
    
    // Check if server supports range requests
    const headResponse = await fetch(url, { method: 'HEAD' });
    const acceptRanges = headResponse.headers.get('Accept-Ranges');
    
    if (acceptRanges && acceptRanges !== 'none') {
      try {
        console.log('Using HttpRangeReader to extract file:', filePath);
        const httpReader = new zip.HttpRangeReader(url);
        reader = new zip.ZipReader(httpReader);
        entries = await reader.getEntries();
      } catch (error) {
        console.error('HttpRangeReader failed for extraction, falling back:', error);
        // Fallback to full download
        const response = await fetch(url);
        const blob = await response.blob();
        const blobReader = new zip.BlobReader(blob);
        reader = new zip.ZipReader(blobReader);
        entries = await reader.getEntries();
      }
    } else {
      console.log('Downloading ZIP file to extract:', filePath);
      const response = await fetch(url);
      const blob = await response.blob();
      const blobReader = new zip.BlobReader(blob);
      reader = new zip.ZipReader(blobReader);
      entries = await reader.getEntries();
    }
    
    // Find the requested file
    const entry = entries.find(e => e.filename === filePath);
    
    if (!entry) {
      throw new Error(`File not found in ZIP: ${filePath}`);
    }
    
    if (entry.directory) {
      throw new Error(`Cannot extract directory: ${filePath}`);
    }
    
    // Extract the file as a Blob
    const extractedBlob = await entry.getData!(new zip.BlobWriter());
    
    // Close the reader
    await reader.close();
    
    return extractedBlob;
  } catch (error) {
    // Clean up reader if it was created
    if (reader) {
      try {
        await reader.close();
      } catch {
        // Ignore close errors
      }
    }
    
    throw new ApiError(
      `Failed to extract file from dump: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      undefined,
      url
    );
  }
}