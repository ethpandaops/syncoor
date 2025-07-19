import { useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useReports } from '../hooks/useReports';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { formatDuration, formatTimestamp, formatBytes } from '../lib/utils';
import { Link, useSearchParams } from 'react-router-dom';

export default function TestList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Get filters from URL params
  const directoryFilter = searchParams.get('directory') || '';
  const networkFilter = searchParams.get('network') || '';
  const clientFilter = searchParams.get('client') || '';
  
  // Apply filters to the reports
  const filters = {
    directory: directoryFilter,
    network: networkFilter,
    execution_client: clientFilter
  };

  const { data: config, isLoading: configLoading, error: configError } = useConfig();
  const { 
    data: reports, 
    isLoading: reportsLoading, 
    error: reportsError, 
    total,
    totalPages
  } = useReports({
    directories: config?.directories || [],
    filters: filters,
    pagination: { page, limit, sortBy, sortOrder }
  });

  if (configLoading || reportsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Test Results</h1>
        </div>
        <Card className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-64"></div>
                  <div className="h-3 bg-muted rounded w-32"></div>
                </div>
                <div className="h-3 bg-muted rounded w-24"></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (configError || reportsError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Test Results</h1>
        </div>
        <Card className="p-6">
          <div className="text-destructive">
            <h3 className="font-semibold mb-2">Error Loading Data</h3>
            <p>{configError?.message || reportsError?.message}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Test Results</h1>
          {(directoryFilter || networkFilter || clientFilter) && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-muted-foreground">Filtered by:</span>
              {directoryFilter && <Badge variant="outline">{directoryFilter}</Badge>}
              {networkFilter && <Badge variant="secondary">{networkFilter}</Badge>}
              {clientFilter && <Badge variant="default">{clientFilter}</Badge>}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchParams({})}
                className="text-xs"
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
        <Badge variant="outline">{total} total tests</Badge>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap gap-4 mb-6">
          <Select value={sortBy} onValueChange={setSortBy}>
            <option value="timestamp">Sort by Date</option>
            <option value="duration">Sort by Duration</option>
            <option value="network">Sort by Network</option>
            <option value="execution_client">Sort by Execution Client</option>
            <option value="consensus_client">Sort by Consensus Client</option>
          </Select>
          
          <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
          
          <Select value={limit.toString()} onValueChange={(value) => setLimit(Number(value))}>
            <option value="10">10 per page</option>
            <option value="20">20 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </Select>
        </div>

        {reports.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No test results found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-3">Timestamp</th>
                    <th className="text-left py-3 px-3">EL</th>
                    <th className="text-left py-3 px-3">CL</th>
                    <th className="text-right py-3 px-3">Block</th>
                    <th className="text-right py-3 px-3">Slot</th>
                    <th className="text-right py-3 px-3">EL Disk</th>
                    <th className="text-right py-3 px-3">CL Disk</th>
                    <th className="text-center py-3 px-3">EL Peers</th>
                    <th className="text-center py-3 px-3">CL Peers</th>
                    <th className="text-right py-3 px-3">Duration</th>
                    <th className="text-left py-3 px-3">Network/Directory</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.run_id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-3">
                        <Link to={`/test/${report.run_id}`} className="text-muted-foreground hover:text-foreground">
                          {formatTimestamp(Number(report.timestamp))}
                        </Link>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <img 
                            src={`/img/clients/${report.execution_client_info.type}.jpg`} 
                            alt={`${report.execution_client_info.type} logo`}
                            className="w-5 h-5 rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <span className="font-medium capitalize">{report.execution_client_info.type}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <img 
                            src={`/img/clients/${report.consensus_client_info.type}.jpg`} 
                            alt={`${report.consensus_client_info.type} logo`}
                            className="w-5 h-5 rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <span className="font-medium capitalize">{report.consensus_client_info.type}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">{report.sync_info.block.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-muted-foreground">{report.sync_info.slot.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        {report.sync_info.last_entry ? formatBytes(report.sync_info.last_entry.de, 1) : '-'}
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        {report.sync_info.last_entry ? formatBytes(report.sync_info.last_entry.dc, 1) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center text-muted-foreground">
                        {report.sync_info.last_entry ? report.sync_info.last_entry.pe : '-'}
                      </td>
                      <td className="py-3 px-3 text-center text-muted-foreground">
                        {report.sync_info.last_entry ? report.sync_info.last_entry.pc : '-'}
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">{formatDuration(report.sync_info.duration)}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{report.network}</Badge>
                          <Badge variant="secondary">{report.source_directory}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{report.run_id}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} total tests)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export { TestList };