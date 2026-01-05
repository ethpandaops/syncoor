/**
 * Configuration types for the Syncoor web application
 */

/**
 * Represents a directory entry in the configuration
 */
export interface Directory {
  /** Unique identifier/key for the directory (used in URLs) */
  name: string;
  /** Display name for the directory (used in UI) */
  displayName?: string;
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
 * Application mode - default for normal Syncoor UI, control-center for aggregated view
 */
export type AppMode = 'default' | 'control-center';

/**
 * Main configuration interface for the application
 */
export interface Config {
  /** Application mode: 'default' for normal UI, 'control-center' for aggregated view */
  mode?: AppMode;
  /** URL to Control Center API (only used in control-center mode) */
  controlCenterEndpoint?: string;
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