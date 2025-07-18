import { useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useReports } from '../hooks/useReports';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { formatDuration, formatTimestamp, groupReportsByDirectoryNetworkAndClient } from '../lib/utils';
import { Link, useSearchParams } from 'react-router-dom';

export default function TestList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [groupedView, setGroupedView] = useState(true);
  
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
          <Button
            variant={groupedView ? "default" : "outline"}
            size="sm"
            onClick={() => setGroupedView(!groupedView)}
          >
            {groupedView ? "List View" : "Grouped View"}
          </Button>
          
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
        ) : groupedView ? (
          <div className="space-y-8">
            {Object.entries(groupReportsByDirectoryNetworkAndClient(reports)).map(([directory, networkGroups]) => (
              <div key={directory} className="space-y-6">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold">{directory}</h3>
                  <Badge variant="outline">
                    {Object.values(networkGroups).flatMap(clientGroups => 
                      Object.values(clientGroups).flat()
                    ).length} tests
                  </Badge>
                </div>
                
                <div className="space-y-6 ml-4">
                  {Object.entries(networkGroups).map(([network, clientGroups]) => (
                    <div key={`${directory}-${network}`} className="space-y-4">
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg font-medium">{network}</h4>
                        <Badge variant="secondary">{Object.values(clientGroups).flat().length} tests</Badge>
                      </div>
                      
                      <div className="grid gap-4 ml-4">
                        {Object.entries(clientGroups).map(([clientType, clientReports]) => (
                          <Card key={`${directory}-${network}-${clientType}`} className="p-4">
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <h5 className="font-medium">{clientType}</h5>
                                <Badge variant="outline">{clientReports.length} tests</Badge>
                              </div>
                              
                              <div className="grid gap-3">
                                {clientReports.map((report) => (
                                  <Link key={report.run_id} to={`/test/${report.run_id}`}>
                                    <div className="p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{report.run_id}</span>
                                          </div>
                                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                            <span>EL: {report.execution_client_info.name}</span>
                                            <span>CL: {report.consensus_client_info.name}</span>
                                            <span>Duration: {formatDuration(report.sync_info.duration)}</span>
                                            <span>Block: {report.sync_info.block.toLocaleString()}</span>
                                            <span>Slot: {report.sync_info.slot.toLocaleString()}</span>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-xs text-muted-foreground">
                                            {formatTimestamp(Number(report.timestamp))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4">
              {reports.map((report) => (
                <Link key={report.run_id} to={`/test/${report.run_id}`}>
                  <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">{report.run_id}</h3>
                          <Badge variant="outline">{report.network}</Badge>
                          <Badge variant="secondary">{report.source_directory}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span>EL: {report.execution_client_info.name}</span>
                          <span>CL: {report.consensus_client_info.name}</span>
                          <span>Duration: {formatDuration(report.sync_info.duration)}</span>
                          <span>Block: {report.sync_info.block.toLocaleString()}</span>
                          <span>Slot: {report.sync_info.slot.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          {formatTimestamp(Number(report.timestamp))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
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