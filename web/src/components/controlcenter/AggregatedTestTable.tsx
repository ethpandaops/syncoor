import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { AggregatedTestSummary, AggregatedTestListResponse, AggregatedTestDetail } from '../../types/controlCenter';
import { useCCTestDetail } from '../../hooks/useControlCenter';
import ProgressCharts from '../ProgressCharts';

interface AggregatedTestTableProps {
  data: AggregatedTestListResponse | undefined;
  isLoading: boolean;
  error?: Error | null;
  onPageChange: (page: number) => void;
  endpoint: string;
}

const AggregatedTestTable: React.FC<AggregatedTestTableProps> = ({
  data,
  isLoading,
  error,
  onPageChange,
  endpoint,
}) => {
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  // Fetch detail for expanded test
  const { data: testDetail, isLoading: detailLoading, error: detailError, refetch: refetchDetail } = useCCTestDetail(
    endpoint,
    expandedTestId || undefined
  );

  // Auto-refresh for running tests
  useEffect(() => {
    if (!expandedTestId || !testDetail?.is_running) return;

    const interval = setInterval(() => {
      refetchDetail();
    }, 30000);

    return () => clearInterval(interval);
  }, [expandedTestId, testDetail?.is_running, refetchDetail]);

  const toggleExpand = useCallback((runId: string) => {
    setExpandedTestId(prev => prev === runId ? null : runId);
  }, []);

  if (isLoading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted/50 p-4">
          <div className="h-4 bg-muted animate-pulse rounded w-1/4" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border-t p-4">
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
        <p className="font-medium">Failed to load tests</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    );
  }

  if (!data || data.tests.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground border rounded-lg">
        <p>No tests found</p>
      </div>
    );
  }

  const getStatusBadge = (test: AggregatedTestSummary) => {
    const status = getTestStatus(test);
    if (status === 'Unknown') {
      return <Badge variant="outline" className="w-20 justify-center text-xs border-yellow-500 text-yellow-600 dark:text-yellow-400">Unknown</Badge>;
    }
    if (status === 'Running') {
      return <Badge variant="default" className="w-20 justify-center text-xs">Running</Badge>;
    }
    if (status === 'Complete') {
      return <Badge variant="success" className="w-20 justify-center text-xs">Complete</Badge>;
    }
    return <Badge variant="destructive" className="w-20 justify-center text-xs">Failed</Badge>;
  };

  const getTestStatus = (test: AggregatedTestSummary): string => {
    if (test.is_complete && !test.error) {
      return 'Complete';
    } else if (test.error || (!test.is_running && !test.is_complete)) {
      return 'Failed';
    }

    if (test.is_running) {
      const now = new Date().getTime();
      const lastUpdate = new Date(test.last_update).getTime();
      const timeSinceUpdate = now - lastUpdate;
      const threeMinutesInMs = 3 * 60 * 1000;

      if (timeSinceUpdate > threeMinutesInMs) {
        return 'Unknown';
      } else {
        return 'Running';
      }
    }

    return 'Failed';
  };

  const getStatusColor = (test: AggregatedTestSummary): string => {
    if (test.is_complete && !test.error) {
      return 'bg-green-500';
    } else if (test.error || (!test.is_running && !test.is_complete)) {
      return 'bg-red-500';
    }

    if (test.is_running) {
      const now = new Date().getTime();
      const lastUpdate = new Date(test.last_update).getTime();
      const timeSinceUpdate = now - lastUpdate;
      const threeMinutesInMs = 3 * 60 * 1000;

      if (timeSinceUpdate > threeMinutesInMs) {
        return 'bg-yellow-500';
      } else {
        return 'bg-blue-500';
      }
    }

    return 'bg-red-500';
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
    return `img/clients/${clientType.toLowerCase()}.jpg`;
  };

  const getTestSource = (test: AggregatedTestSummary) => {
    const githubUrl = test.labels?.['github.repository'];
    const githubRunNumber = test.labels?.['github.run_number'];

    return {
      type: githubUrl ? 'github' : 'unknown',
      url: githubUrl,
      runNumber: githubRunNumber,
      displayText: githubUrl ? `#${githubRunNumber}` : 'Manual'
    };
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              Showing {((data.page - 1) * data.page_size) + 1}-
              {Math.min(data.page * data.page_size, data.total_count)} of {data.total_count}
            </span>
            <span className="text-muted-foreground">|</span>
            <span>
              <span className="text-green-600 dark:text-green-400 font-medium">{data.active_count}</span> active
            </span>
            <span className="text-muted-foreground">|</span>
            <span>
              {data.instance_count} instance{data.instance_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs">
                <th className="p-2 font-medium w-8"></th>
                <th className="p-2 font-medium">Instance</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Network</th>
                <th className="p-2 font-medium">EL Client</th>
                <th className="p-2 font-medium">CL Client</th>
                <th className="p-2 font-medium">Block/Slot</th>
                <th className="p-2 font-medium">Peers</th>
                <th className="p-2 font-medium">EL Disk</th>
                <th className="p-2 font-medium">Source</th>
                <th className="p-2 font-medium">System Info</th>
                <th className="p-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {data.tests.map((test) => {
                const isExpanded = expandedTestId === test.run_id;
                const currentDetail = isExpanded ? testDetail : undefined;
                const status = getTestStatus(test);
                const sourceInfo = getTestSource(test);
                const jobId = test.labels?.['github.job_id'];
                const runId = test.labels?.['github.run_id'];
                const jobIdSuffix = jobId ? jobId.slice(-3) : '';

                return (
                  <React.Fragment key={`${test.instance_name}-${test.run_id}`}>
                    <tr
                      className={`border-t hover:bg-muted/30 cursor-pointer ${isExpanded ? 'bg-muted/20' : ''}`}
                      onClick={() => toggleExpand(test.run_id)}
                    >
                      {/* Expand Icon */}
                      <td className="p-2">
                        <ChevronIcon className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </td>

                      {/* Instance */}
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {test.instance_name}
                        </Badge>
                      </td>

                      {/* Status */}
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(test)}
                          {status === 'Running' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={`w-2 h-2 rounded-full ${getStatusColor(test)} animate-pulse cursor-pointer`} />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Last updated {formatTimeAgo(test.last_update)}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {status === 'Unknown' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={`w-2 h-2 rounded-full ${getStatusColor(test)} cursor-pointer`} />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Last updated {formatTimeAgo(test.last_update)} ({'>'} 3min ago)</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>

                      {/* Network */}
                      <td className="p-2">
                        <div className="inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold">
                          {test.network}
                        </div>
                      </td>

                      {/* EL Client */}
                      <td className="p-2">
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

                      {/* CL Client */}
                      <td className="p-2">
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

                      {/* Block/Slot */}
                      <td className="p-2">
                        {test.current_metrics ? (
                          <div className="text-xs">
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
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>

                      {/* Peers */}
                      <td className="p-2">
                        {test.current_metrics ? (
                          <div className="text-xs">
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
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>

                      {/* EL Disk */}
                      <td className="p-2">
                        {test.current_metrics ? (
                          <span className="flex items-center gap-1 text-xs">
                            <DatabaseIcon className="h-3 w-3" />
                            {formatDiskUsage(test.current_metrics.exec_disk_usage)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <div className="flex-shrink-0">
                            {sourceInfo.type === 'github' ? (
                              <GitHubIcon className="w-4 h-4" />
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
                              >
                                {sourceInfo.displayText}{jobIdSuffix ? `(${jobIdSuffix})` : ''}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">{sourceInfo.displayText}</span>
                            )}
                          </span>
                        </div>
                      </td>

                      {/* System Info */}
                      <td className="p-2">
                        {test.system_info ? (
                          <div className="text-xs">
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">Host:</span>
                              <span className="truncate" style={{ maxWidth: '100px' }}>
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

                      {/* Duration */}
                      <td className="p-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help text-xs">
                              <div>{formatDuration(test.start_time, test.is_complete ? test.last_update : undefined)}</div>
                              {test.run_timeout && test.run_timeout > 0 && (
                                <div className="text-muted-foreground">Timeout: {formatTimeout(test.run_timeout)}</div>
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
                                return <div>Test has exceeded timeout</div>;
                              })()}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <tr className="border-t bg-muted/10">
                        <td colSpan={12} className="p-4">
                          <ExpandedTestDetails
                            test={test}
                            detail={currentDetail}
                            isLoading={detailLoading}
                            error={detailError}
                            getClientLogo={getClientLogo}
                            capitalizeClient={capitalizeClient}
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

        {/* Pagination */}
        {data.total_pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(data.page - 1)}
              disabled={data.page === 1}
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {data.page} of {data.total_pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(data.page + 1)}
              disabled={data.page === data.total_pages}
            >
              Next
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

// Expanded test details component
interface ExpandedTestDetailsProps {
  test: AggregatedTestSummary;
  detail?: AggregatedTestDetail;
  isLoading: boolean;
  error?: Error | null;
  getClientLogo: (clientType: string) => string;
  capitalizeClient: (clientType: string) => string;
}

const ExpandedTestDetails: React.FC<ExpandedTestDetailsProps> = ({
  test,
  detail,
  isLoading,
  error,
  getClientLogo,
  capitalizeClient,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <LoaderIcon className="h-5 w-5 animate-spin mr-2" />
        <span>Loading test details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <AlertCircleIcon className="h-4 w-4" />
        <span>Error loading details: {error.message}</span>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="space-y-4">
      {/* Instance Info Banner */}
      <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <span className="text-sm text-blue-700 dark:text-blue-300">
          Instance: <strong>{detail.instance_name}</strong>
        </span>
        {detail.instance_ui_url && (
          <a
            href={detail.instance_ui_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
          >
            Open Instance UI
          </a>
        )}
      </div>

      {/* Error information if present */}
      {detail.error && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm text-red-600 dark:text-red-400">Error</h4>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-3 overflow-hidden">
            <pre className="text-xs text-red-800 dark:text-red-300 whitespace-pre-wrap break-all overflow-hidden">{detail.error}</pre>
          </div>
        </div>
      )}

      {/* Test Information */}
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Test Information</h4>
        <div className="bg-background rounded-lg border p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <span className="text-xs text-muted-foreground">Run ID:</span>
            <div className="font-mono text-xs break-all overflow-hidden">{detail.run_id}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Network:</span>
            <div className="text-xs break-all overflow-hidden">{detail.network}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Enclave:</span>
            <div className="font-mono text-xs break-all overflow-hidden">{detail.enclave_name}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Started:</span>
            <div className="text-xs break-all overflow-hidden">{new Date(detail.start_time).toLocaleString()}</div>
          </div>
          {detail.end_time && (
            <div>
              <span className="text-xs text-muted-foreground">Ended:</span>
              <div className="text-xs break-all overflow-hidden">{new Date(detail.end_time).toLocaleString()}</div>
            </div>
          )}
          {detail.run_timeout && (
            <div>
              <span className="text-xs text-muted-foreground">Timeout:</span>
              <div className="text-xs">
                {Math.floor(detail.run_timeout / 3600)}h {Math.floor((detail.run_timeout % 3600) / 60)}m
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Client Configuration Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* EL Client Config */}
        {detail.el_client_config && (
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
                <span className="text-xs text-muted-foreground">Version:</span>
                <div className="font-mono text-xs break-all overflow-hidden">
                  {test.current_metrics?.exec_version || detail.el_client_config?.image?.split(':')[1] || 'N/A'}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Image:</span>
                <div className="font-mono text-xs break-all overflow-hidden">{detail.el_client_config.image}</div>
              </div>
              {detail.el_client_config.cmd && detail.el_client_config.cmd.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Command Args:</span>
                  <div className="font-mono text-xs space-y-1 max-h-32 overflow-y-auto">
                    {detail.el_client_config.cmd.map((arg: string, i: number) => (
                      <div key={i} className="text-blue-600 dark:text-blue-400 break-all overflow-hidden">{arg}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CL Client Config */}
        {detail.cl_client_config && (
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
                <span className="text-xs text-muted-foreground">Version:</span>
                <div className="font-mono text-xs break-all overflow-hidden">
                  {test.current_metrics?.cons_version || detail.cl_client_config?.image?.split(':')[1] || 'N/A'}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Image:</span>
                <div className="font-mono text-xs break-all overflow-hidden">{detail.cl_client_config.image}</div>
              </div>
              {detail.cl_client_config.cmd && detail.cl_client_config.cmd.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Command Args:</span>
                  <div className="font-mono text-xs space-y-1 max-h-32 overflow-y-auto">
                    {detail.cl_client_config.cmd.map((arg: string, i: number) => (
                      <div key={i} className="text-blue-600 dark:text-blue-400 break-all overflow-hidden">{arg}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Progress Charts */}
      {detail.progress_history && detail.progress_history.length > 0 && (
        <div className="border-t pt-4">
          <div className="space-y-2 mb-4">
            <h3 className="text-lg font-semibold">Progress Over Time</h3>
            {test.is_running && (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-700 dark:text-green-300">
                  Live data - Charts update automatically every 30 seconds
                </span>
                <span className="ml-auto text-xs text-green-600 dark:text-green-400">
                  {detail.progress_history.length} data points
                </span>
              </div>
            )}
          </div>
          <ProgressCharts
            progressHistory={detail.progress_history}
            showTitle={false}
            compact={true}
          />
        </div>
      )}
    </div>
  );
};

// Icon components
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

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <polyline points="15,18 9,12 15,6" />
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

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

export default AggregatedTestTable;
