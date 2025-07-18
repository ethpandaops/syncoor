import { useConfig } from '../hooks/useConfig';
import { useReports } from '../hooks/useReports';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { formatDuration, formatTimestamp, groupReportsByDirectoryNetworkAndClient } from '../lib/utils';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { data: config, isLoading: configLoading, error: configError } = useConfig();
  const { data: reports, isLoading: reportsLoading, error: reportsError, total } = useReports({
    directories: config?.directories || [],
    pagination: { page: 1, limit: 10, sortBy: 'timestamp', sortOrder: 'desc' }
  });

  if (configLoading || reportsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Syncoor Dashboard</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="p-6">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (configError || reportsError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Syncoor Dashboard</h1>
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
        <h1 className="text-3xl font-bold">Syncoor Dashboard</h1>
        <Badge variant="outline">{total} total tests</Badge>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Total Tests</h3>
              <p className="text-2xl font-bold">{total}</p>
            </div>
            <div className="text-muted-foreground">
              📊
            </div>
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Active Directories</h3>
              <p className="text-2xl font-bold">{config?.directories.filter(d => d.enabled).length || 0}</p>
            </div>
            <div className="text-muted-foreground">
              📁
            </div>
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Latest Test</h3>
              <p className="text-sm text-muted-foreground">
                {reports[0] ? formatTimestamp(Number(reports[0].timestamp)) : 'No tests'}
              </p>
            </div>
            <div className="text-muted-foreground">
              🕐
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Test Results by Directory, Network & Client</h2>
        
        {reports.length === 0 ? (
          <Card className="p-6">
            <p className="text-muted-foreground">No test results found.</p>
          </Card>
        ) : (
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
                                {clientReports.slice(0, 3).map((report) => (
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
                                
                                {clientReports.length > 3 && (
                                  <Link to={`/tests?directory=${encodeURIComponent(directory)}&network=${encodeURIComponent(network)}&client=${encodeURIComponent(clientType)}`}>
                                    <div className="p-3 rounded-lg border-dashed border-2 hover:bg-muted/50 transition-colors cursor-pointer text-center">
                                      <span className="text-sm text-muted-foreground">
                                        View {clientReports.length - 3} more {clientType} tests...
                                      </span>
                                    </div>
                                  </Link>
                                )}
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
        )}
      </div>
    </div>
  );
}

export { Dashboard };