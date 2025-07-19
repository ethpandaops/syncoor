import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { SyncoorApiEndpoint } from '../types/config';
import { TestSummary, HealthResponse } from '../types/syncoor';
import { fetchSyncoorTests, fetchSyncoorHealth } from '../lib/syncoorApi';
import { useSearchParams } from 'react-router-dom';

interface SyncoorTestsProps {
  endpoints: SyncoorApiEndpoint[];
  className?: string;
}

interface EndpointData {
  endpoint: SyncoorApiEndpoint;
  tests: TestSummary[];
  health: HealthResponse | null;
  loading: boolean;
  error: string | null;
}

const SyncoorTests: React.FC<SyncoorTestsProps> = ({ endpoints, className }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [endpointData, setEndpointData] = useState<EndpointData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const testsPerPage = 10;

  // Initialize collapsed state from URL or default to true
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const collapsed = searchParams.get('liveTestsCollapsed');
    return collapsed === null ? true : collapsed === 'true';
  });

  // Function to toggle collapsed state and update URL
  const toggleCollapsed = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    
    const newParams = new URLSearchParams(searchParams);
    newParams.set('liveTestsCollapsed', newCollapsed.toString());
    setSearchParams(newParams);
  };

  // Initialize endpoint data
  useEffect(() => {
    const enabledEndpoints = endpoints.filter(endpoint => endpoint.enabled);
    setEndpointData(
      enabledEndpoints.map(endpoint => ({
        endpoint,
        tests: [],
        health: null,
        loading: true,
        error: null,
      }))
    );
  }, [endpoints]);

  // Fetch data for all endpoints
  useEffect(() => {
    const fetchData = async () => {
      for (let i = 0; i < endpointData.length; i++) {
        const data = endpointData[i];
        if (!data.loading) continue;

        try {
          const [testsResponse, healthResponse] = await Promise.allSettled([
            fetchSyncoorTests(data.endpoint),
            fetchSyncoorHealth(data.endpoint),
          ]);

          const tests = testsResponse.status === 'fulfilled' ? testsResponse.value.tests : [];
          const health = healthResponse.status === 'fulfilled' ? healthResponse.value : null;
          const error = testsResponse.status === 'rejected'
            ? `${testsResponse.reason instanceof Error ? testsResponse.reason.message : 'Unknown error'}`
            : null;

          setEndpointData(prev => prev.map((item, index) =>
            index === i
              ? { ...item, tests, health, loading: false, error }
              : item
          ));
        } catch (error) {
          setEndpointData(prev => prev.map((item, index) =>
            index === i
              ? {
                  ...item,
                  loading: false,
                  error: error instanceof Error ? error.message : 'Unknown error'
                }
              : item
          ));
        }
      }
    };

    // Trigger fetch if there are endpoints and any of them are loading
    const hasLoadingEndpoints = endpointData.some(item => item.loading);
    if (endpointData.length > 0 && hasLoadingEndpoints) {
      fetchData();
    }
  }, [endpointData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Trigger refresh by resetting loading state for all endpoints
      setEndpointData(prev => prev.map(item => ({
        ...item,
        loading: true,
        error: null
      })));
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const formatDiskUsage = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDuration = (startTime: string, endTime?: string): string => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getStatusBadge = (test: TestSummary) => {
    if (test.is_running) {
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Running</Badge>;
    }
    if (test.is_complete) {
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Complete</Badge>;
    }
    return <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">Unknown</Badge>;
  };

  const getClientLogo = (clientType: string): string => {
    return `/img/clients/${clientType.toLowerCase()}.jpg`;
  };

  const capitalizeClient = (clientType: string): string => {
    return clientType.charAt(0).toUpperCase() + clientType.slice(1);
  };

  const getNetworkSummary = (tests: TestSummary[]) => {
    const runningTests = tests.filter(test => test.is_running);
    const networkCounts = runningTests.reduce((acc, test) => {
      acc[test.network] = (acc[test.network] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(networkCounts)
      .sort(([a], [b]) => {
        if (a === 'mainnet') return -1;
        if (b === 'mainnet') return 1;
        return a.localeCompare(b);
      });
  };

  if (endpointData.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ServerIcon className="h-5 w-5" />
            Live Syncoor Tests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No syncoor API endpoints configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      {endpointData.map((data, index) => (
        <Card key={index} className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleCollapsed}
                  className="flex items-center gap-2 hover:bg-muted/50 rounded p-1 -ml-1"
                >
                  <ChevronIcon className={`h-4 w-4 transition-transform ${isCollapsed ? 'rotate-0' : 'rotate-90'}`} />
                  <div className="flex items-center gap-2">
                    {(() => {
                      const runningTests = data.tests.filter(test => test.is_running);
                      return runningTests.length > 0 && (
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      );
                    })()}
                    <ServerIcon className="h-5 w-5" />
                    Live Running Tests - {data.endpoint.name}
                  </div>
                </button>
                {data.loading && <LoaderIcon className="h-4 w-4 animate-spin" />}
              </div>
              {data.health && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <DatabaseIcon className="h-4 w-4" />
                    {data.health.total_tests} total
                  </span>
                  <span className="flex items-center gap-1">
                    <ClockIcon className="h-4 w-4" />
                    {data.health.active_tests} active
                  </span>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.error ? (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircleIcon className="h-4 w-4" />
                <span>{data.error}</span>
              </div>
            ) : data.loading ? (
              <div className="flex items-center justify-center py-8">
                <LoaderIcon className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading tests...</span>
              </div>
            ) : (() => {
                const runningTests = data.tests.filter(test => test.is_running);
                const completedTests = data.tests.filter(test => !test.is_running);
                const allTests = [...runningTests, ...completedTests]; // Running tests first

                if (allTests.length === 0) {
                  return <p className="text-muted-foreground py-4">No tests available.</p>;
                }

                if (isCollapsed) {
                  // Show network summary when collapsed
                  const networkSummary = getNetworkSummary(data.tests);
                  return (
                    <div className="flex flex-wrap gap-2">
                      {networkSummary.map(([network, count]) => (
                        <Badge key={network} variant="secondary" className="text-sm">
                          {network}: {count} running
                        </Badge>
                      ))}
                    </div>
                  );
                }

                // Show full table when expanded
                const totalPages = Math.ceil(allTests.length / testsPerPage);
                const startIndex = (currentPage - 1) * testsPerPage;
                const endIndex = startIndex + testsPerPage;
                const paginatedTests = allTests.slice(startIndex, endIndex);

                return (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 font-medium">Status</th>
                            <th className="pb-2 font-medium">Network</th>
                            <th className="pb-2 font-medium">EL Client</th>
                            <th className="pb-2 font-medium">CL Client</th>
                            <th className="pb-2 font-medium">Block/Slot</th>
                            <th className="pb-2 font-medium">EL Peers</th>
                            <th className="pb-2 font-medium">CL Peers</th>
                            <th className="pb-2 font-medium">EL Disk</th>
                            <th className="pb-2 font-medium">Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedTests.map((test, testIndex) => (
                      <tr key={testIndex} className="border-b">
                        <td className="py-2">
                          {getStatusBadge(test)}
                        </td>
                        <td className="py-2">
                          <Badge variant="outline">{test.network}</Badge>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <img
                              src={getClientLogo(test.el_client)}
                              alt={test.el_client}
                              className="w-5 h-5 rounded"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <span className="font-medium">{capitalizeClient(test.el_client)}</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <img
                              src={getClientLogo(test.cl_client)}
                              alt={test.cl_client}
                              className="w-5 h-5 rounded"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <span className="font-medium">{capitalizeClient(test.cl_client)}</span>
                          </div>
                        </td>
                        <td className="py-2">
                          {test.current_metrics ? (
                            <div className="text-sm">
                              <div>{test.current_metrics.block.toLocaleString()}</div>
                              <div className="text-muted-foreground">{test.current_metrics.slot.toLocaleString()}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-2">
                          {test.current_metrics ? (
                            <span className="flex items-center gap-1">
                              <UsersIcon className="h-3 w-3" />
                              {test.current_metrics.exec_peers}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-2">
                          {test.current_metrics ? (
                            <span className="flex items-center gap-1">
                              <UsersIcon className="h-3 w-3" />
                              {test.current_metrics.cons_peers}
                            </span>
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
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-3 w-3" />
                            {formatDuration(test.start_time, test.is_complete ? test.last_update : undefined)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                      </table>
                    </div>
                    
                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Showing {startIndex + 1}-{Math.min(endIndex, allTests.length)} of {allTests.length} tests
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 text-sm border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <span className="text-sm">
                            Page {currentPage} of {totalPages}
                          </span>
                          <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 text-sm border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// SVG Icon Components
function ServerIcon({ className }: { className?: string }) {
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
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
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

function ClockIcon({ className }: { className?: string }) {
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

function ChevronIcon({ className }: { className?: string }) {
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

export default SyncoorTests;
