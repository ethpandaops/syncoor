import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { SyncoorApiEndpoint } from '../types/config';
import { TestSummary, TestDetail, HealthResponse } from '../types/syncoor';
import { fetchSyncoorTests, fetchSyncoorHealth, fetchSyncoorTestDetail } from '../lib/syncoorApi';
import { useSearchParams } from 'react-router-dom';
import LiveTestExpanded from './LiveTestExpanded';

interface LiveTestsProps {
  endpoints: SyncoorApiEndpoint[];
  className?: string;
}

interface EndpointData {
  endpoint: SyncoorApiEndpoint;
  tests: TestSummary[];
  health: HealthResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

interface TestDetails {
  [key: string]: {
    loading: boolean;
    data?: TestDetail;
    error?: string;
  };
}

const LiveTests: React.FC<LiveTestsProps> = ({ endpoints, className }) => {
  const [endpointData, setEndpointData] = useState<EndpointData[]>([]);
  const [searchParams] = useSearchParams();
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [testDetails, setTestDetails] = useState<TestDetails>({});

  const autoExpand = searchParams.get('expand') === 'true';
  const showActiveOnly = searchParams.get('active') === 'true';

  // Initialize endpoint data
  useEffect(() => {
    const enabledEndpoints = endpoints.filter(endpoint => endpoint.enabled);
    setEndpointData(
      enabledEndpoints.map(endpoint => ({
        endpoint,
        tests: [],
        health: null,
        loading: true,
        refreshing: false,
        error: null,
      }))
    );
  }, [endpoints]);

  // Fetch data for all endpoints
  useEffect(() => {
    const fetchData = async () => {
      for (let i = 0; i < endpointData.length; i++) {
        const data = endpointData[i];
        if (!data.loading && !data.refreshing) continue;

        try {
          const [testsResponse, healthResponse] = await Promise.allSettled([
            fetchSyncoorTests(data.endpoint),
            fetchSyncoorHealth(data.endpoint),
          ]);

          const testsResponse_data = testsResponse.status === 'fulfilled' ? testsResponse.value : null;
          const health = healthResponse.status === 'fulfilled' ? healthResponse.value : null;

          setEndpointData(prev => {
            const newData = [...prev];
            newData[i] = {
              ...data,
              tests: testsResponse_data?.tests || [],
              health,
              loading: false,
              refreshing: false,
              error: testsResponse.status === 'rejected' ? testsResponse.reason?.message || 'Failed to fetch tests' : null,
            };
            return newData;
          });
        } catch (error) {
          setEndpointData(prev => {
            const newData = [...prev];
            newData[i] = {
              ...data,
              loading: false,
              refreshing: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
            return newData;
          });
        }
      }
    };

    // Trigger fetch if there are endpoints and any of them are loading or refreshing
    const hasLoadingEndpoints = endpointData.some(item => item.loading || item.refreshing);
    if (endpointData.length > 0 && hasLoadingEndpoints) {
      fetchData();
    }
  }, [endpointData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Trigger refresh by setting refreshing state for all endpoints (keep existing data visible)
      setEndpointData(prev => prev.map(item => ({
        ...item,
        refreshing: true,
        error: null
      })));
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const updateTestDetail = useCallback(async (testKey: string) => {
    // The testKey format is: {endpointUrl}|||{runId}
    const parts = testKey.split('|||');
    if (parts.length !== 2) {
      return;
    }
    const endpointUrl = parts[0];
    const runId = parts[1];
    const endpoint = endpointData.find(d => d.endpoint.url === endpointUrl);
    
    if (!endpoint) {
      return;
    }

    try {
      const detail = await fetchSyncoorTestDetail(endpoint.endpoint, runId);

      // Update state with new data
      setTestDetails(prev => {
        const existing = prev[testKey]?.data;

        // Always create a completely new object structure for React to detect changes
        const newData = { ...detail };

        if (existing && existing.progress_history && detail.progress_history) {
          // Create a map of existing timestamps for deduplication
          const existingTimestamps = new Set(
            existing.progress_history.map(p => p.timestamp)
          );

          // Add only new progress points
          const newProgressPoints = detail.progress_history.filter(
            p => !existingTimestamps.has(p.timestamp)
          );

          if (newProgressPoints.length > 0) {
            // Merge and sort by timestamp - create completely new array
            newData.progress_history = [
              ...existing.progress_history,
              ...newProgressPoints
            ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          } else {
            // No new points, keep existing history but still create new reference
            newData.progress_history = [...existing.progress_history];
          }
        }

        return {
          ...prev,
          [testKey]: {
            loading: false,
            data: newData
          }
        };
      });
    } catch (error) {
      // Don't update the error state to avoid disrupting the user experience
    }
  }, [endpointData]);

  // Safety check for endpoints
  if (!endpoints) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Syncoor Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No syncoor API endpoints provided.</p>
        </CardContent>
      </Card>
    );
  }

  const toggleTestExpansion = async (testKey: string) => {
    const isCurrentlyExpanded = expandedTests.has(testKey);

    if (isCurrentlyExpanded) {
      // Collapse
      setExpandedTests(prev => {
        const newSet = new Set(prev);
        newSet.delete(testKey);
        return newSet;
      });
    } else {
      // Expand
      setExpandedTests(prev => new Set(prev).add(testKey));

      // If not already loading or loaded, fetch details
      if (!testDetails[testKey]) {
        // Set loading state
        setTestDetails(prev => ({
          ...prev,
          [testKey]: { loading: true }
        }));

        // Parse the key to get endpoint and runId
        const parts = testKey.split('|||');
        if (parts.length !== 2) {
          setTestDetails(prev => ({
            ...prev,
            [testKey]: {
              loading: false,
              error: 'Invalid test key format'
            }
          }));
          return;
        }
        const endpointUrl = parts[0];
        const runId = parts[1];
        const endpoint = endpointData.find(d => d.endpoint.url === endpointUrl);

        if (endpoint) {
          try {
            const detail = await fetchSyncoorTestDetail(endpoint.endpoint, runId);
            setTestDetails(prev => ({
              ...prev,
              [testKey]: {
                loading: false,
                data: detail
              }
            }));
          } catch (error) {
            setTestDetails(prev => ({
              ...prev,
              [testKey]: {
                loading: false,
                error: error instanceof Error ? error.message : 'Failed to load test details'
              }
            }));
          }
        }
      }
    }
  };

  const formatDuration = (startTime: string, endTime?: string): string => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatTimeout = (timeout: number): string => {
    const timeoutHours = Math.floor(timeout / 3600);
    const timeoutMinutes = Math.floor((timeout % 3600) / 60);
    if (timeoutHours > 0) {
      return `${timeoutHours}h${timeoutMinutes > 0 ? ` ${timeoutMinutes}m` : ''}`;
    } else {
      return `${timeoutMinutes}m`;
    }
  };

  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes === 1) return '1 minute ago';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };


  const formatDiskUsage = (bytes: number): string => {
    if (!bytes || bytes === 0) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };




  const capitalizeClient = (clientType: string): string => {
    return clientType.charAt(0).toUpperCase() + clientType.slice(1);
  };

  const getClientLogo = (clientType: string): string => {
    // Use the same path format as other components in the codebase
    return `img/clients/${clientType.toLowerCase()}.jpg`;
  };

  const getTestSource = (test: TestSummary) => {
    const githubUrl = test.labels?.['github.repository'];
    const githubRunNumber = test.labels?.['github.run_number'];

    return {
      type: githubUrl ? 'github' : 'unknown',
      url: githubUrl,
      runNumber: githubRunNumber,
      displayText: githubUrl ? `#${githubRunNumber}` : 'Manual'
    };
  };

  const getStatusColor = (test: TestSummary): string => {
    if (test.is_running) {
      return 'bg-blue-500';
    } else if (test.is_complete && !test.error) {
      return 'bg-green-500';
    } else {
      return 'bg-red-500';
    }
  };

  // If no endpoints are configured, show message
  if (endpointData.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Syncoor Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No syncoor API endpoints configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className={`space-y-6 ${className}`}>
      {endpointData.map((data, index) => (
        <Card key={index}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <DashboardIcon className="h-5 w-5" />
                Live Tests - {data.endpoint.name}
              </CardTitle>
              <div className="flex items-center gap-3">
                {!data.loading && !data.error && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-medium">{data.tests.length}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-muted-foreground">Active:</span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {data.tests.filter(t => t.is_running).length}
                    </span>
                  </div>
                )}
                {data.refreshing && <div className="text-xs text-muted-foreground">Refreshing...</div>}
                {data.health && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`w-3 h-3 rounded-full ${(!data.error && (data.health.status === 'ok' || data.health.status === 'healthy')) ? 'bg-green-500' : 'bg-red-500'}`} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>API Status: {data.health.status}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {data.loading ? (
              <div className="flex items-center gap-2">
                <LoaderIcon className="h-4 w-4 animate-spin" />
                <span>Loading tests...</span>
              </div>
            ) : data.error ? (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircleIcon className="h-4 w-4" />
                <span>Error: {data.error}</span>
              </div>
            ) : data.tests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Tests will appear here when they're running or have been completed recently</p>
              </div>
            ) : (() => {
              const filteredTests = showActiveOnly
                ? data.tests.filter(test => test.is_running)
                : data.tests;

              // Sort tests:
              // 1. Running tests first
              // 2. Then by start time (newest first)
              // 3. If same start time, sort by EL and CL client types
              // 4. Completed/Failed tests last
              const sortedTests = [...filteredTests].sort((a, b) => {
                // First sort by status: running tests come first
                if (a.is_running && !b.is_running) return -1;
                if (!a.is_running && b.is_running) return 1;

                // For non-running tests, put completed/failed at the end
                if (!a.is_running && !b.is_running) {
                  const aIsDone = a.is_complete || a.error;
                  const bIsDone = b.is_complete || b.error;
                  if (aIsDone && !bIsDone) return 1;
                  if (!aIsDone && bIsDone) return -1;
                }

                // Then sort by start time (newest first - reverse chronological order)
                const aStartTime = a.start_time ? new Date(a.start_time).getTime() : 0;
                const bStartTime = b.start_time ? new Date(b.start_time).getTime() : 0;

                if (bStartTime !== aStartTime) {
                  return bStartTime - aStartTime;
                }

                // If start times are equal, sort by EL client type
                const elComparison = a.el_client.localeCompare(b.el_client);
                if (elComparison !== 0) {
                  return elComparison;
                }

                // If EL clients are the same, sort by CL client type
                return a.cl_client.localeCompare(b.cl_client);
              });

              const paginatedTests = sortedTests.slice(0, 50); // Show max 50 tests

              return (
                <div className="space-y-4">
                  {/* Summary info */}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {filteredTests.length} test{filteredTests.length !== 1 ? 's' : ''}
                      {showActiveOnly && ' (active only)'}
                    </span>
                    {filteredTests.length > 50 && (
                      <span>Showing first 50 of {filteredTests.length}</span>
                    )}
                  </div>

                  {/* Tests table */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr className="text-left text-xs">
                          <th className="pt-2 pb-2 font-medium"></th>
                          <th className="pt-2 pb-2 font-medium">Status</th>
                          <th className="pt-2 pb-2 font-medium">Network</th>
                          <th className="pt-2 pb-2 font-medium">EL Client</th>
                          <th className="pt-2 pb-2 font-medium">CL Client</th>
                          <th className="pt-2 pb-2 font-medium">Block/Slot</th>
                          <th className="pt-2 pb-2 font-medium">Peers</th>
                          <th className="pt-2 pb-2 font-medium">EL Disk</th>
                          <th className="pt-2 pb-2 font-medium">Source</th>
                          <th className="pt-2 pb-2 font-medium text-left">System Info</th>
                          <th className="pt-2 pb-2 font-medium">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTests.map((test, testIndex) => {
                          const testKey = `${data.endpoint.url}|||${test.run_id}`;
                          const isExpanded = expandedTests.has(testKey);
                          const shouldAutoExpand = autoExpand && test.is_running && !expandedTests.has(testKey);

                          // Auto-expand if needed
                          if (shouldAutoExpand) {
                            toggleTestExpansion(testKey);
                          }

                          return (
                            <React.Fragment key={testIndex}>
                              <tr
                                className="border-t hover:bg-muted/30 cursor-pointer"
                                onClick={() => toggleTestExpansion(testKey)}
                              >
                                <td className="py-2 w-6">
                                  <div className="flex justify-center">
                                    {isExpanded ? (
                                      <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </div>
                                </td>
                                <td className="py-2">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant={test.is_running ? "default" : test.is_complete && !test.error ? "success" : "destructive"}
                                      className="w-20 justify-center text-xs"
                                    >
                                      {test.is_running ? 'Running' : test.is_complete && !test.error ? 'Complete' : 'Failed'}
                                    </Badge>
                                    {test.is_running && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className={`w-2 h-2 rounded-full ${getStatusColor(test)} animate-pulse cursor-pointer`} />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">Last updated {formatTimeAgo(test.last_update)}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                    {!test.is_running && !test.is_complete && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className={`w-2 h-2 rounded-full ${getStatusColor(test)} cursor-pointer`} />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">Last updated {formatTimeAgo(test.last_update)}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2">
                                  <div className="inline-flex items-center rounded-sm border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-hidden focus:ring-3 focus:ring-ring text-foreground">
                                    {test.network}
                                  </div>
                                </td>
                                <td className="py-2">
                                  <div className="flex items-center gap-2">
                                    <img
                                      src={getClientLogo(test.el_client)}
                                      alt={test.el_client}
                                      className="w-5 h-5 rounded flex-shrink-0"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                    <div>
                                      <div className="text-xs font-medium">{capitalizeClient(test.el_client)}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {(() => {
                                          const version = test.current_metrics?.exec_version || test.el_client_config?.image?.split(':')[1] || 'N/A';
                                          return version.length > 20 ? `${version.slice(0, 20)}...` : version;
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2">
                                  <div className="flex items-center gap-2">
                                    <img
                                      src={getClientLogo(test.cl_client)}
                                      alt={test.cl_client}
                                      className="w-5 h-5 rounded flex-shrink-0"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                    <div>
                                      <div className="text-xs font-medium">{capitalizeClient(test.cl_client)}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {(() => {
                                          const version = test.current_metrics?.cons_version || test.cl_client_config?.image?.split(':')[1] || 'N/A';
                                          return version.length > 20 ? `${version.slice(0, 20)}...` : version;
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2">
                                  {test.current_metrics ? (
                                    <div className="text-sm">
                                      <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">B:</span>
                                        <span>{test.current_metrics.block.toLocaleString()}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">S:</span>
                                        <span>{test.current_metrics.slot.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="py-2">
                                  {test.current_metrics ? (
                                    <div className="text-sm">
                                      <div className="flex items-center gap-1">
                                        <UsersIcon className="h-3 w-3" />
                                        <span className="text-muted-foreground">EL:</span>
                                        <span>{test.current_metrics.exec_peers}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <UsersIcon className="h-3 w-3" />
                                        <span className="text-muted-foreground">CL:</span>
                                        <span>{test.current_metrics.cons_peers}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="py-2">
                                  {test.current_metrics ? (
                                    <span className="flex items-center gap-1">
                                      <DatabaseIcon className="h-3 w-3" />
                                      {formatDiskUsage(test.current_metrics.exec_disk_usage)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="py-2">
                                  {(() => {
                                    const sourceInfo = getTestSource(test);
                                    const jobId = test.labels?.['github.job_id'];
                                    const runId = test.labels?.['github.run_id'];
                                    const jobIdSuffix = jobId ? jobId.slice(-3) : '';

                                    return (
                                      <div className="flex items-center gap-1">
                                        <div className="flex-shrink-0">
                                          {sourceInfo.type === 'github' ? (
                                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                            </svg>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">•</span>
                                          )}
                                        </div>
                                        <span className="text-xs truncate">
                                          {sourceInfo.url && runId ? (
                                            <a
                                              href={jobId
                                                ? `https://github.com/${sourceInfo.url}/actions/runs/${runId}/job/${jobId}`
                                                : `https://github.com/${sourceInfo.url}/actions/runs/${runId}`
                                              }
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              {sourceInfo.displayText}{jobIdSuffix ? `(${jobIdSuffix})` : ''}
                                            </a>
                                          ) : (
                                            <span className="text-muted-foreground">{sourceInfo.displayText}</span>
                                          )}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="py-2">
                                  {test.system_info ? (
                                    <div className="text-xs">
                                      <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">Host:</span>
                                        <span className="truncate" style={{ maxWidth: '150px' }}>
                                          {test.system_info.hostname || 'N/A'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">CPU:</span>
                                        <span>{test.system_info.cpu_cores || 'N/A'} cores</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">RAM:</span>
                                        <span>
                                          {test.system_info.total_memory
                                            ? `${(test.system_info.total_memory / (1024 * 1024 * 1024)).toFixed(0)} GB`
                                            : 'N/A'
                                          }
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">No data</span>
                                  )}
                                </td>
                        <td className="py-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <div>{formatDuration(test.start_time, test.is_complete ? test.last_update : undefined)}</div>
                                {test.run_timeout && test.run_timeout > 0 && (
                                  <div className="text-xs text-muted-foreground">Timeout: {formatTimeout(test.run_timeout)}</div>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="bg-gray-900 text-white border-gray-800">
                              <div className="text-xs">
                                <div>Running time: {formatDuration(test.start_time, test.is_complete ? test.last_update : undefined)}</div>
                                {test.run_timeout && test.run_timeout > 0 && (
                                  <div>Timeout: {formatTimeout(test.run_timeout)}</div>
                                )}
                                {test.run_timeout && !test.is_complete && test.is_running && (() => {
                                  const start = new Date(test.start_time);
                                  const now = new Date();
                                  const elapsedSec = Math.floor((now.getTime() - start.getTime()) / 1000);
                                  const remainingSec = test.run_timeout - elapsedSec;
                                  if (remainingSec > 0) {
                                    const remainingHours = Math.floor(remainingSec / 3600);
                                    const remainingMinutes = Math.floor((remainingSec % 3600) / 60);
                                    return <div>Time remaining: {remainingHours}h {remainingMinutes}m</div>;
                                  }
                                  return <div>⚠️ Test has exceeded timeout</div>;
                                })()}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-muted/30">
                                  <td colSpan={11} className="p-4 overflow-hidden">
                                    <LiveTestExpanded
                                      testKey={testKey}
                                      test={test}
                                      detail={testDetails[testKey]}
                                      getClientLogo={getClientLogo}
                                      capitalizeClient={capitalizeClient}
                                      onUpdateDetail={updateTestDetail}
                                    />
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ))}
      </div>
    </TooltipProvider>
  );
};

// SVG Icon Components
function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

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

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  );
}


function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <polyline points="9,18 15,12 9,6" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <polyline points="6,9 12,15 18,9" />
    </svg>
  );
}

export default LiveTests;
export type { LiveTestsProps };
