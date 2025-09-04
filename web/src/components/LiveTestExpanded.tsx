import React, { useState, useEffect } from 'react';
import { TestSummary, TestDetail } from '../types/syncoor';
import ProgressCharts from './ProgressCharts';

interface LiveTestExpandedProps {
  testKey: string;
  test: TestSummary;
  detail?: { loading: boolean; data?: TestDetail; error?: string };
  getClientLogo: (clientType: string) => string;
  capitalizeClient: (clientType: string) => string;
  onUpdateDetail: (testKey: string) => void;
}

const LiveTestExpanded: React.FC<LiveTestExpandedProps> = ({ 
  testKey,
  test, 
  detail, 
  getClientLogo, 
  capitalizeClient,
  onUpdateDetail
}) => {
  const [lastFetch, setLastFetch] = useState<Date>(new Date());
  const [secondsSinceLastFetch, setSecondsSinceLastFetch] = useState(0);

  // Auto-update for running tests
  useEffect(() => {
    if (!test.is_running) {
      return;
    }

    // Only set up updates if we have initial data
    if (!detail?.data) {
      return;
    }

    // Initial fetch on mount
    const fetchData = () => {
      onUpdateDetail(testKey);
      setLastFetch(new Date());
    };
    
    // Fetch immediately
    fetchData();

    // Set up periodic updates every 30 seconds for running tests
    const interval = setInterval(fetchData, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [test.is_running, testKey, onUpdateDetail]); // Remove detail?.data to prevent constant re-running

  // Update seconds since last fetch
  useEffect(() => {
    if (!test.is_running) return;

    const timer = setInterval(() => {
      setSecondsSinceLastFetch(Math.floor((new Date().getTime() - lastFetch.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [lastFetch, test.is_running]);

  if (detail?.loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <LoaderIcon className="h-5 w-5 animate-spin mr-2" />
        <span>Loading test details...</span>
      </div>
    );
  }
  
  if (detail?.error) {
    return (
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <AlertCircleIcon className="h-4 w-4" />
        <span>Error loading details: {detail.error}</span>
      </div>
    );
  }
  
  const testDetail = detail?.data;
  if (!testDetail) return null;
  
  return (
    <div className="space-y-4">
      {/* Error information if present */}
      {testDetail.error && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm text-red-600 dark:text-red-400">Error</h4>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-3 overflow-hidden">
            <pre className="text-xs text-red-800 dark:text-red-300 whitespace-pre-wrap break-all overflow-hidden">{testDetail.error}</pre>
          </div>
        </div>
      )}
      
      {/* Test Information */}
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Test Information</h4>
        <div className="bg-background rounded-lg border p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <span className="text-xs text-muted-foreground">Run ID:</span>
            <div className="font-mono text-xs break-all overflow-hidden">{testDetail.run_id}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Network:</span>
            <div className="text-xs break-all overflow-hidden">{testDetail.network}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Enclave:</span>
            <div className="font-mono text-xs break-all overflow-hidden">{testDetail.enclave_name}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Started:</span>
            <div className="text-xs break-all overflow-hidden">{new Date(testDetail.start_time).toLocaleString()}</div>
          </div>
          {testDetail.end_time && (
            <div>
              <span className="text-xs text-muted-foreground">Ended:</span>
              <div className="text-xs break-all overflow-hidden">{new Date(testDetail.end_time).toLocaleString()}</div>
            </div>
          )}
          {testDetail.run_timeout && (
            <div>
              <span className="text-xs text-muted-foreground">Timeout:</span>
              <div className="text-xs">
                {Math.floor(testDetail.run_timeout / 3600)}h {Math.floor((testDetail.run_timeout % 3600) / 60)}m
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* System Information */}
      {testDetail.system_info && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            System Information
          </h4>
          <div className="bg-background rounded-lg border p-3 grid grid-cols-2 md:grid-cols-3 gap-3 overflow-hidden">
            {testDetail.system_info.hostname && (
              <div>
                <span className="text-xs text-muted-foreground">Hostname:</span>
                <div className="font-mono text-xs break-all overflow-hidden">{testDetail.system_info.hostname}</div>
              </div>
            )}
            {testDetail.system_info.os_name && (
              <div>
                <span className="text-xs text-muted-foreground">Operating System:</span>
                <div className="text-xs break-all overflow-hidden">
                  {testDetail.system_info.os_name} {testDetail.system_info.os_architecture}
                </div>
              </div>
            )}
            {testDetail.system_info.kernel_version && (
              <div>
                <span className="text-xs text-muted-foreground">Kernel:</span>
                <div className="text-xs break-all overflow-hidden">{testDetail.system_info.kernel_version}</div>
              </div>
            )}
            {testDetail.system_info.cpu_model && (
              <div className="md:col-span-2">
                <span className="text-xs text-muted-foreground">CPU:</span>
                <div className="text-xs break-all overflow-hidden">{testDetail.system_info.cpu_model}</div>
              </div>
            )}
            {testDetail.system_info.cpu_cores && (
              <div>
                <span className="text-xs text-muted-foreground">CPU Cores:</span>
                <div className="text-xs break-all overflow-hidden">
                  {testDetail.system_info.cpu_cores} cores{testDetail.system_info.cpu_threads && ` / ${testDetail.system_info.cpu_threads} threads`}
                </div>
              </div>
            )}
            {testDetail.system_info.total_memory && (
              <div>
                <span className="text-xs text-muted-foreground">Memory:</span>
                <div className="text-xs break-all overflow-hidden">
                  {(testDetail.system_info.total_memory / (1024 * 1024 * 1024)).toFixed(1)} GB
                </div>
              </div>
            )}
            {testDetail.system_info.syncoor_version && (
              <div>
                <span className="text-xs text-muted-foreground">Syncoor Version:</span>
                <div className="text-xs break-all overflow-hidden">{testDetail.system_info.syncoor_version}</div>
              </div>
            )}
            {testDetail.system_info.go_version && (
              <div>
                <span className="text-xs text-muted-foreground">Go Version:</span>
                <div className="text-xs break-all overflow-hidden">{testDetail.system_info.go_version}</div>
              </div>
            )}
            {testDetail.system_info.product_vendor && (
              <div>
                <span className="text-xs text-muted-foreground">Hardware Vendor:</span>
                <div className="text-xs break-all overflow-hidden">{testDetail.system_info.product_vendor}</div>
              </div>
            )}
            {testDetail.system_info.board_vendor && testDetail.system_info.board_name && (
              <div className="md:col-span-2">
                <span className="text-xs text-muted-foreground">Motherboard:</span>
                <div className="text-xs break-all overflow-hidden">
                  {testDetail.system_info.board_vendor} {testDetail.system_info.board_name}
                </div>
              </div>
            )}
            {testDetail.system_info.platform_family && (
              <div>
                <span className="text-xs text-muted-foreground">Platform:</span>
                <div className="text-xs break-all overflow-hidden">
                  {testDetail.system_info.platform_family} {testDetail.system_info.platform_version}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* GitHub Information if available */}
      {test.labels && Object.keys(test.labels).some(key => key.startsWith('github.')) && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub Actions
          </h4>
          <div className="bg-background rounded-lg border p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
            {test.labels && test.labels['github.repository'] && (
              <div>
                <span className="text-xs text-muted-foreground">Repository:</span>
                <div className="text-xs">
                  <a
                    href={`https://github.com/${test.labels['github.repository']}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300 break-all overflow-hidden"
                  >
                    {test.labels['github.repository']}
                  </a>
                </div>
              </div>
            )}
            {test.labels && test.labels['github.workflow'] && (
              <div>
                <span className="text-xs text-muted-foreground">Workflow:</span>
                <div className="text-xs break-all overflow-hidden">{test.labels['github.workflow']}</div>
              </div>
            )}
            {test.labels && test.labels['github.actor'] && (
              <div>
                <span className="text-xs text-muted-foreground">Actor:</span>
                <div className="text-xs break-all overflow-hidden">{test.labels['github.actor']}</div>
              </div>
            )}
            {test.labels && test.labels['github.ref'] && (
              <div>
                <span className="text-xs text-muted-foreground">Branch:</span>
                <div className="font-mono text-xs break-all overflow-hidden">{test.labels['github.ref']?.replace('refs/heads/', '')}</div>
              </div>
            )}
            {test.labels && test.labels['github.sha'] && (
              <div>
                <span className="text-xs text-muted-foreground">Commit:</span>
                <div className="font-mono text-xs break-all overflow-hidden">{test.labels['github.sha']?.substring(0, 7)}</div>
              </div>
            )}
            {test.labels && test.labels['github.run_number'] && (
              <div>
                <span className="text-xs text-muted-foreground">Run Number:</span>
                <div className="text-xs break-all overflow-hidden">#{test.labels['github.run_number']}</div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Client Configuration Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* EL Client Config */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <img
              src={getClientLogo(test.el_client)}
              alt={test.el_client}
              className="w-4 h-4 rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            Execution Layer ({capitalizeClient(test.el_client)})
          </h4>
          <div className="bg-background rounded-lg border p-3 space-y-2 overflow-hidden">
            <div>
              <span className="text-xs text-muted-foreground">Image:</span>
              <div className="font-mono text-xs break-all overflow-hidden">{testDetail.el_client_config.image}</div>
            </div>
            {testDetail.el_client_config.extra_args && testDetail.el_client_config.extra_args.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Command Args:</span>
                <div className="font-mono text-xs space-y-1">
                  {testDetail.el_client_config.extra_args.map((arg, i) => (
                    <div key={i} className="text-blue-600 dark:text-blue-400 break-all overflow-hidden">{arg}</div>
                  ))}
                </div>
              </div>
            )}
            {testDetail.el_client_config.env_vars && Object.keys(testDetail.el_client_config.env_vars).length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Environment Variables:</span>
                <div className="font-mono text-xs space-y-1">
                  {Object.entries(testDetail.el_client_config.env_vars).map(([key, value]) => (
                    <div key={key} className="break-all overflow-hidden">
                      <span className="text-green-600 dark:text-green-400">{key}</span>=<span className="text-gray-600 dark:text-gray-400">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* CL Client Config */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <img
              src={getClientLogo(test.cl_client)}
              alt={test.cl_client}
              className="w-4 h-4 rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            Consensus Layer ({capitalizeClient(test.cl_client)})
          </h4>
          <div className="bg-background rounded-lg border p-3 space-y-2 overflow-hidden">
            <div>
              <span className="text-xs text-muted-foreground">Image:</span>
              <div className="font-mono text-xs break-all overflow-hidden">{testDetail.cl_client_config.image}</div>
            </div>
            {testDetail.cl_client_config.extra_args && testDetail.cl_client_config.extra_args.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Command Args:</span>
                <div className="font-mono text-xs space-y-1">
                  {testDetail.cl_client_config.extra_args.map((arg, i) => (
                    <div key={i} className="text-blue-600 dark:text-blue-400 break-all overflow-hidden">{arg}</div>
                  ))}
                </div>
              </div>
            )}
            {testDetail.cl_client_config.env_vars && Object.keys(testDetail.cl_client_config.env_vars).length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Environment Variables:</span>
                <div className="font-mono text-xs space-y-1">
                  {Object.entries(testDetail.cl_client_config.env_vars).map(([key, value]) => (
                    <div key={key} className="break-all overflow-hidden">
                      <span className="text-green-600 dark:text-green-400">{key}</span>=<span className="text-gray-600 dark:text-gray-400">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Progress Charts */}
      {testDetail.progress_history && testDetail.progress_history.length > 0 && (
        <div className="border-t pt-4">
          <div className="space-y-2 mb-4">
            <h3 className="text-lg font-semibold">Progress Over Time</h3>
            {test.is_running && (
              <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-blue-700 dark:text-blue-300">
                    Live data - Charts update automatically
                  </span>
                </div>
                <span className="text-xs text-blue-600 dark:text-blue-400">
                  Last updated: {secondsSinceLastFetch}s ago
                  {testDetail.progress_history && (
                    <span className="ml-2 opacity-75">
                      ({testDetail.progress_history.length} data points)
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
          <ProgressCharts 
            progressHistory={testDetail.progress_history}
            showTitle={false}
            compact={true}
          />
        </div>
      )}
    </div>
  );
};

// Icon components needed by the component
function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export default LiveTestExpanded;
export type { LiveTestExpandedProps };