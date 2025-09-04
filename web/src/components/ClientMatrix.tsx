import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { SyncReport } from '../types/report';
import { formatDuration, formatTimestamp } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

interface ClientMatrixProps {
  reports: SyncReport[];
  directory: string;
  network: string;
  className?: string;
}

interface ReportData {
  report: SyncReport;
  status: 'success' | 'failed' | 'timeout' | 'error';
  duration: number;
}

interface MatrixCell {
  elClient: string;
  clClient: string;
  recentReports: ReportData[];
  averageDuration?: number;
  fastestDuration?: number;
}

const ClientMatrix: React.FC<ClientMatrixProps> = ({
  reports,
  directory,
  network,
  className
}) => {
  const navigate = useNavigate();

  const matrixData = useMemo(() => {
    // Filter reports by directory and network
    const filteredReports = reports.filter(
      r => r.source_directory === directory && r.network === network
    );

    if (filteredReports.length === 0) return { matrix: [], elClients: [], clClients: [] };

    // Get unique EL and CL clients
    const elClients = [...new Set(filteredReports.map(r => r.execution_client_info.type))].sort();
    const clClients = [...new Set(filteredReports.map(r => r.consensus_client_info.type))].sort();

    // Create matrix with last 5 reports for each combination
    const matrix: MatrixCell[][] = [];

    elClients.forEach(elClient => {
      const row: MatrixCell[] = [];

      clClients.forEach(clClient => {
        // Find reports for this combination
        const combinationReports = filteredReports.filter(
          r => r.execution_client_info.type === elClient &&
               r.consensus_client_info.type === clClient
        );

        if (combinationReports.length > 0) {
          // Sort by timestamp to get the most recent ones
          const sortedReports = combinationReports.sort((a, b) =>
            Number(b.timestamp) - Number(a.timestamp)
          );

          // Take up to 5 most recent reports
          const recentReports = sortedReports.slice(0, 5).map(report => ({
            report,
            status: (report.sync_info.status || 'success') as 'success' | 'failed' | 'timeout' | 'error',
            duration: report.sync_info.duration
          }));

          // Calculate average and fastest duration for successful runs
          const successfulRuns = recentReports.filter(r => r.status === 'success');
          const averageDuration = successfulRuns.length > 0
            ? successfulRuns.reduce((sum, r) => sum + r.duration, 0) / successfulRuns.length
            : undefined;
          const fastestDuration = successfulRuns.length > 0
            ? Math.min(...successfulRuns.map(r => r.duration))
            : undefined;

          row.push({
            elClient,
            clClient,
            recentReports,
            averageDuration,
            fastestDuration
          });
        } else {
          row.push({
            elClient,
            clClient,
            recentReports: [],
            averageDuration: undefined,
            fastestDuration: undefined
          });
        }
      });

      matrix.push(row);
    });

    return { matrix, elClients, clClients };
  }, [reports, directory, network]);

  const getStatusColor = (status: 'success' | 'failed' | 'timeout' | 'error' | null): string => {
    switch (status) {
      case 'success':
        return 'bg-green-500';
      case 'failed':
      case 'error':
        return 'bg-red-500';
      case 'timeout':
        return 'bg-yellow-500';
      default:
        return 'bg-muted';
    }
  };

  const getStatusText = (status: 'success' | 'failed' | 'timeout' | 'error' | null): string => {
    switch (status) {
      case 'success':
        return 'Success';
      case 'failed':
        return 'Failed';
      case 'error':
        return 'Error';
      case 'timeout':
        return 'Timeout';
      default:
        return 'No Data';
    }
  };

  const capitalizeClient = (clientType: string): string => {
    return clientType.charAt(0).toUpperCase() + clientType.slice(1);
  };

  const formatAverageDuration = (seconds: number): string => {
    if (seconds < 0) {
      return 'Invalid duration';
    }

    if (seconds === 0) {
      return '0s';
    }

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts: string[] = [];

    if (days > 0) {
      parts.push(`${days}d`);
    }
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }

    // Only include seconds if total duration is less than 60 seconds
    if (seconds < 60 && secs > 0) {
      parts.push(`${secs}s`);
    }

    return parts.join(' ') || '0s';
  };

  if (matrixData.matrix.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            Client Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No test data available for the selected directory and network.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            Client Matrix
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Most recent test results for {directory} / {network} ({matrixData.elClients.length} EL × {matrixData.clClients.length} CL clients)
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left py-3 px-3 font-medium text-sm">EL \ CL</th>
                    {matrixData.clClients.map(clClient => (
                      <th key={clClient} className="text-center py-3 px-2 font-medium text-sm min-w-20">
                        <div className="flex flex-col items-center gap-1">
                          <img
                            src={`img/clients/${clClient}.jpg`}
                            alt={clClient}
                            className="w-5 h-5 rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <span className="capitalize">{capitalizeClient(clClient)}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixData.matrix.map((row, rowIndex) => (
                    <tr key={matrixData.elClients[rowIndex]} className="border-t">
                      <td className="py-3 px-3 font-medium">
                        <div className="flex items-center gap-2">
                          <img
                            src={`img/clients/${matrixData.elClients[rowIndex]}.jpg`}
                            alt={matrixData.elClients[rowIndex]}
                            className="w-5 h-5 rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <span className="capitalize">{capitalizeClient(matrixData.elClients[rowIndex])}</span>
                        </div>
                      </td>
                      {row.map((cell, cellIndex) => (
                        <td key={`${cell.elClient}-${cell.clClient}`} className="py-3 px-2">
                          {cell.recentReports.length > 0 ? (
                            <div className="flex flex-col items-center gap-1.5">
                              {/* Duration statistics display */}
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="text-sm font-medium">
                                  {cell.averageDuration ? `⌀ ${formatAverageDuration(cell.averageDuration)}` : '⌀ N/A'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {cell.fastestDuration ? `⚡︎ ${formatAverageDuration(cell.fastestDuration)}` : '⚡︎ N/A'}
                                </div>
                              </div>
                              {/* Last 5 runs as small boxes */}
                              <div className="flex gap-1 justify-center">
                                {/* Show up to 5 boxes, fill with empty if less than 5 */}
                                {[...Array(5)].map((_, idx) => {
                                  const report = cell.recentReports[idx];
                                  if (report) {
                                    return (
                                      <Tooltip key={idx}>
                                        <TooltipTrigger asChild>
                                          <div
                                            className={`w-3 h-3 rounded-sm cursor-pointer transition-transform hover:scale-150 ${getStatusColor(report.status)}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigate(`/test/${report.report.run_id}`);
                                            }}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <span>{formatDuration(report.duration)}</span>
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  } else {
                                    return (
                                      <div
                                        key={idx}
                                        className="w-3 h-3 rounded-sm border border-muted-foreground/20"
                                      />
                                    );
                                  }
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="text-sm text-muted-foreground">No Data</div>
                              <div className="flex gap-1">
                                {[...Array(5)].map((_, idx) => (
                                  <div
                                    key={idx}
                                    className="w-3 h-3 rounded-sm border border-muted-foreground/20"
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 pt-4 border-t space-y-2">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Status Legend:</span>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-green-500"></div>
                  <span>Success</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-red-500"></div>
                  <span>Failed/Error</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-yellow-500"></div>
                  <span>Timeout</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm border border-muted-foreground/20"></div>
                  <span>No Run</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Shows last 5 test runs (newest on the left). ⌀ = average, ⚡︎ = fastest (from successful runs only). Click to view details.
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default ClientMatrix;
