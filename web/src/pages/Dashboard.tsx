import { useConfig } from '../hooks/useConfig';
import { useReports } from '../hooks/useReports';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { formatDuration, formatTimestamp, formatBytes, groupReportsByDirectoryNetworkAndClient } from '../lib/utils';
import { ClientGroupDurationChart, ClientGroupDiskChart } from '../components/charts';
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
                              
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b text-muted-foreground">
                                      <th className="text-left py-2 px-2">Timestamp</th>
                                      <th className="text-left py-2 px-2">EL</th>
                                      <th className="text-left py-2 px-2">CL</th>
                                      <th className="text-right py-2 px-2">Block</th>
                                      <th className="text-right py-2 px-2">Slot</th>
                                      <th className="text-right py-2 px-2">EL Disk</th>
                                      <th className="text-right py-2 px-2">CL Disk</th>
                                      <th className="text-center py-2 px-2">EL Peers</th>
                                      <th className="text-center py-2 px-2">CL Peers</th>
                                      <th className="text-right py-2 px-2">Duration</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {clientReports.slice(0, 3).map((report) => (
                                      <tr key={report.run_id} className="border-b hover:bg-muted/50 transition-colors">
                                        <td className="py-2 px-2">
                                          <Link to={`/test/${report.run_id}`} className="text-muted-foreground hover:text-foreground">
                                            {formatTimestamp(Number(report.timestamp))}
                                          </Link>
                                        </td>
                                        <td className="py-2 px-2 font-medium">{report.execution_client_info.type}</td>
                                        <td className="py-2 px-2 font-medium">{report.consensus_client_info.type}</td>
                                        <td className="py-2 px-2 text-right text-muted-foreground">{report.sync_info.block.toLocaleString()}</td>
                                        <td className="py-2 px-2 text-right text-muted-foreground">{report.sync_info.slot.toLocaleString()}</td>
                                        <td className="py-2 px-2 text-right text-muted-foreground">
                                          {report.sync_info.last_entry ? formatBytes(report.sync_info.last_entry.de, 1) : '-'}
                                        </td>
                                        <td className="py-2 px-2 text-right text-muted-foreground">
                                          {report.sync_info.last_entry ? formatBytes(report.sync_info.last_entry.dc, 1) : '-'}
                                        </td>
                                        <td className="py-2 px-2 text-center text-muted-foreground">
                                          {report.sync_info.last_entry ? report.sync_info.last_entry.pe : '-'}
                                        </td>
                                        <td className="py-2 px-2 text-center text-muted-foreground">
                                          {report.sync_info.last_entry ? report.sync_info.last_entry.pc : '-'}
                                        </td>
                                        <td className="py-2 px-2 text-right text-muted-foreground">{formatDuration(report.sync_info.duration)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                
                                {clientReports.length > 3 && (
                                  <Link to={`/tests?directory=${encodeURIComponent(directory)}&network=${encodeURIComponent(network)}&client=${encodeURIComponent(clientType)}`}>
                                    <div className="mt-3 p-3 rounded-lg border-dashed border-2 hover:bg-muted/50 transition-colors cursor-pointer text-center">
                                      <span className="text-sm text-muted-foreground">
                                        View {clientReports.length - 3} more {clientType} tests...
                                      </span>
                                    </div>
                                  </Link>
                                )}
                              </div>
                              
                              {/* Charts for client group */}
                              {clientReports.length > 1 && (
                                <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  <Card className="p-4">
                                    <ClientGroupDurationChart
                                      data={clientReports}
                                      height={250}
                                      color="#3b82f6"
                                      title={`${clientType} - Duration Trends`}
                                    />
                                  </Card>
                                  <Card className="p-4">
                                    <ClientGroupDiskChart
                                      data={clientReports}
                                      height={250}
                                      color="#10b981"
                                      title={`${clientType} - EL Disk Usage Trends`}
                                    />
                                  </Card>
                                </div>
                              )}
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