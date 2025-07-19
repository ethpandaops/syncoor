/**
 * Configuration types for the Syncoor web application
 */

/**
 * Represents a directory entry in the configuration
 */
export interface Directory {
  /** Display name for the directory */
  name: string;
  /** URL endpoint for the directory */
  url: string;
  /** Whether this directory is enabled */
  enabled: boolean;
}

/**
 * Represents a syncoor API endpoint in the configuration
 */
export interface SyncoorApiEndpoint {
  /** Display name for the endpoint */
  name: string;
  /** URL for the syncoor API */
  url: string;
  /** Whether this endpoint is enabled */
  enabled: boolean;
}

/**
 * Main configuration interface for the application
 */
export interface Config {
  /** List of configured directories */
  directories: Directory[];
  /** List of syncoor API endpoints */
  syncoorApiEndpoints?: SyncoorApiEndpoint[];
  /** Refresh interval in milliseconds */
  refreshInterval: number;
  /** Theme settings */
  theme: ThemeConfig;
}

/**
 * Theme configuration
 */
export interface ThemeConfig {
  /** Color mode: 'light' | 'dark' | 'auto' */
  mode: 'light' | 'dark' | 'auto';
  /** Primary color for the theme */
  primaryColor?: string;
}