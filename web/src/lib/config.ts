import { Config, Directory, ThemeConfig, SyncoorApiEndpoint } from '../types/config';

/**
 * Validates that the theme config is properly structured
 */
function validateThemeConfig(theme: unknown): ThemeConfig {
  if (typeof theme === 'string') {
    // Handle legacy string format
    return {
      mode: theme as 'light' | 'dark' | 'auto',
    };
  }

  if (typeof theme !== 'object' || theme === null) {
    throw new Error('Theme configuration must be an object or string');
  }

  const themeObj = theme as Record<string, unknown>;

  const mode = themeObj.mode;
  if (mode !== 'light' && mode !== 'dark' && mode !== 'auto') {
    throw new Error(`Invalid theme mode: ${mode}. Must be 'light', 'dark', or 'auto'`);
  }

  const validatedTheme: ThemeConfig = { mode };

  if ('primaryColor' in themeObj && typeof themeObj.primaryColor === 'string') {
    validatedTheme.primaryColor = themeObj.primaryColor;
  }

  return validatedTheme;
}

/**
 * Validates that a directory entry is properly structured
 */
function validateDirectory(dir: unknown, index: number): Directory {
  if (typeof dir !== 'object' || dir === null) {
    throw new Error(`Directory at index ${index} must be an object`);
  }

  const dirObj = dir as Record<string, unknown>;

  if (typeof dirObj.name !== 'string' || !dirObj.name.trim()) {
    throw new Error(`Directory at index ${index} must have a non-empty name`);
  }

  if (typeof dirObj.url !== 'string' || !dirObj.url.trim()) {
    throw new Error(`Directory at index ${index} must have a non-empty url`);
  }

  // Validate URL format
  try {
    new URL(dirObj.url);
  } catch {
    throw new Error(`Directory at index ${index} has invalid URL: ${dirObj.url}`);
  }

  const enabled = dirObj.enabled !== false; // Default to true if not specified

  return {
    name: dirObj.name,
    url: dirObj.url.endsWith('/') ? dirObj.url : `${dirObj.url}/`,
    enabled,
  };
}

/**
 * Validates that a syncoor API endpoint entry is properly structured
 */
function validateSyncoorApiEndpoint(endpoint: unknown, index: number): SyncoorApiEndpoint {
  if (typeof endpoint !== 'object' || endpoint === null) {
    throw new Error(`Syncoor API endpoint at index ${index} must be an object`);
  }

  const endpointObj = endpoint as Record<string, unknown>;

  if (typeof endpointObj.name !== 'string' || !endpointObj.name.trim()) {
    throw new Error(`Syncoor API endpoint at index ${index} must have a non-empty name`);
  }

  if (typeof endpointObj.url !== 'string' || !endpointObj.url.trim()) {
    throw new Error(`Syncoor API endpoint at index ${index} must have a non-empty url`);
  }

  // Validate URL format
  try {
    new URL(endpointObj.url);
  } catch {
    throw new Error(`Syncoor API endpoint at index ${index} has invalid URL: ${endpointObj.url}`);
  }

  const enabled = endpointObj.enabled !== false; // Default to true if not specified

  return {
    name: endpointObj.name,
    url: endpointObj.url,
    enabled,
  };
}

/**
 * Validates the configuration data and returns a typed Config object
 * @param data - The raw configuration data to validate
 * @returns A validated Config object
 * @throws Error if validation fails
 */
export function validateConfig(data: unknown): Config {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Configuration must be an object');
  }

  const config = data as Record<string, unknown>;

  // Validate directories
  if (!Array.isArray(config.directories)) {
    throw new Error('Configuration must have a directories array');
  }

  if (config.directories.length === 0) {
    throw new Error('Configuration must have at least one directory');
  }

  const directories = config.directories.map((dir, index) => validateDirectory(dir, index));

  // Validate syncoor API endpoints (optional)
  let syncoorApiEndpoints: SyncoorApiEndpoint[] | undefined;
  if (config.syncoorApiEndpoints) {
    if (!Array.isArray(config.syncoorApiEndpoints)) {
      throw new Error('syncoorApiEndpoints must be an array');
    }
    syncoorApiEndpoints = config.syncoorApiEndpoints.map((endpoint, index) => 
      validateSyncoorApiEndpoint(endpoint, index)
    );
  }

  // Validate refresh interval
  const refreshInterval = typeof config.refreshInterval === 'number'
    ? config.refreshInterval
    : 30000; // Default to 30 seconds

  if (refreshInterval < 1000) {
    throw new Error('Refresh interval must be at least 1000ms (1 second)');
  }

  // Validate theme
  const theme = validateThemeConfig(config.theme || { mode: 'dark' });

  return {
    directories,
    syncoorApiEndpoints,
    refreshInterval,
    theme,
  };
}

/**
 * Loads the configuration from the public config.json file
 * @returns A promise that resolves to the validated Config object
 * @throws Error if the configuration cannot be loaded or is invalid
 */
export async function loadConfig(): Promise<Config> {
  try {
    const response = await fetch('/config.json');

    if (!response.ok) {
      throw new Error(`Failed to load configuration: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return validateConfig(data);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Configuration error: ${error.message}`);
    }
    throw new Error('Unknown error loading configuration');
  }
}
