import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { SyncReport } from '../types/report';
import { formatDuration } from '../lib/utils';

interface ClientCompatibilityMatrixProps {
  reports: SyncReport[];
  directory: string;
  network: string;
  className?: string;
}

interface MatrixCell {
  elClient: string;
  clClient: string;
  report?: SyncReport;
  status?: 'success' | 'failed' | 'timeout' | null;
  duration?: number;
}

const ClientCompatibilityMatrix: React.FC<ClientCompatibilityMatrixProps> = ({
  reports,
  directory,
  network,
  className
}) => {
  const matrixData = useMemo(() => {
    // Filter reports by directory and network
    const filteredReports = reports.filter(
      r => r.source_directory === directory && r.network === network
    );

    if (filteredReports.length === 0) return { matrix: [], elClients: [], clClients: [] };

    // Get unique EL and CL clients
    const elClients = [...new Set(filteredReports.map(r => r.execution_client_info.type))].sort();
    const clClients = [...new Set(filteredReports.map(r => r.consensus_client_info.type))].sort();

    // Create matrix with most recent report for each combination
    const matrix: MatrixCell[][] = [];
    
    elClients.forEach(elClient => {
      const row: MatrixCell[] = [];
      
      clClients.forEach(clClient => {
        // Find the most recent report for this combination
        const combinationReports = filteredReports.filter(
          r => r.execution_client_info.type === elClient && 
               r.consensus_client_info.type === clClient
        );

        if (combinationReports.length > 0) {
          // Sort by timestamp to get the most recent
          const mostRecentReport = combinationReports.sort((a, b) => 
            Number(b.timestamp) - Number(a.timestamp)
          )[0];

          row.push({
            elClient,
            clClient,
            report: mostRecentReport,
            status: mostRecentReport.sync_info.status || 'success',
            duration: mostRecentReport.sync_info.duration
          });
        } else {
          row.push({
            elClient,
            clClient,
            report: undefined,
            status: null,
            duration: undefined
          });
        }
      });
      
      matrix.push(row);
    });

    return { matrix, elClients, clClients };
  }, [reports, directory, network]);

  const getStatusColor = (status: MatrixCell['status']): string => {
    switch (status) {
      case 'success':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'timeout':
        return 'bg-yellow-500';
      default:
        return 'bg-muted';
    }
  };

  const getStatusText = (status: MatrixCell['status']): string => {
    switch (status) {
      case 'success':
        return 'Success';
      case 'failed':
        return 'Failed';
      case 'timeout':
        return 'Timeout';
      default:
        return 'No Data';
    }
  };

  const capitalizeClient = (clientType: string): string => {
    return clientType.charAt(0).toUpperCase() + clientType.slice(1);
  };

  if (matrixData.matrix.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">Client Compatibility Matrix</CardTitle>
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
          <CardTitle className="text-lg">Client Compatibility Matrix</CardTitle>
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
                        <td key={`${cell.elClient}-${cell.clClient}`} className="py-3 px-2 text-center">
                          {cell.report ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="cursor-pointer">
                                  <div className={`w-full h-12 rounded flex flex-col items-center justify-center text-white text-xs font-medium ${getStatusColor(cell.status)}`}>
                                    <div>{cell.duration ? formatDuration(cell.duration) : 'N/A'}</div>
                                    <div className="text-xs opacity-80">{getStatusText(cell.status)}</div>
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="space-y-1 text-xs">
                                  <div className="font-medium">{capitalizeClient(cell.elClient)} + {capitalizeClient(cell.clClient)}</div>
                                  <div>Status: {getStatusText(cell.status)}</div>
                                  <div>Duration: {cell.duration ? formatDuration(cell.duration) : 'N/A'}</div>
                                  <div>Block: {cell.report.sync_info.block.toLocaleString()}</div>
                                  <div>Slot: {cell.report.sync_info.slot.toLocaleString()}</div>
                                  {cell.report.sync_info.last_entry && (
                                    <>
                                      <div>EL Peers: {cell.report.sync_info.last_entry.pe}</div>
                                      <div>CL Peers: {cell.report.sync_info.last_entry.pc}</div>
                                    </>
                                  )}
                                  <div>Run ID: {cell.report.run_id}</div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="w-full h-12 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                              No Data
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
          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <span className="text-sm font-medium">Status Legend:</span>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-500"></div>
                <span>Success</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-red-500"></div>
                <span>Failed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-yellow-500"></div>
                <span>Timeout</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-muted"></div>
                <span>No Data</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default ClientCompatibilityMatrix;