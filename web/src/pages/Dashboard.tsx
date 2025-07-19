import { useState, useMemo, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useReports } from '../hooks/useReports';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { formatDuration, formatTimestamp, formatBytes, groupReportsByDirectoryNetworkAndClient, calculateClientGroupStats } from '../lib/utils';
import { ClientGroupDurationChart, ClientGroupDiskChart } from '../components/charts';
import { Link, useSearchParams } from 'react-router-dom';
import SyncoorTests from '../components/SyncoorTests';

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: config, isLoading: configLoading, error: configError } = useConfig();
  const { data: reports, isLoading: reportsLoading, error: reportsError, total } = useReports({
    directories: config?.directories || [],
    pagination: { page: 1, limit: 10000, sortBy: 'timestamp', sortOrder: 'desc' }
  });

  // Get all unique directories
  const availableDirectories = useMemo(() => {
    if (!reports || reports.length === 0) return [];
    const directories = new Set(reports.map(report => report.source_directory));
    return Array.from(directories).sort();
  }, [reports]);

  // Get networks for the active directory
  const getNetworksForDirectory = (directory: string) => {
    const directoryReports = reports.filter(r => r.source_directory === directory);
    const networks = new Set(directoryReports.map(report => report.network));
    const networkArray = Array.from(networks);

    // Sort with mainnet first, then alphabetically
    return networkArray.sort((a, b) => {
      if (a === 'mainnet') return -1;
      if (b === 'mainnet') return 1;
      return a.localeCompare(b);
    });
  };

  // Initialize state from URL params or defaults
  const [activeDirectory, setActiveDirectory] = useState<string | null>(() => {
    return searchParams.get('directory');
  });
  const [activeNetworks, setActiveNetworks] = useState<Record<string, string>>(() => {
    const network = searchParams.get('network');
    const directory = searchParams.get('directory');
    if (directory && network) {
      return { [directory]: network };
    }
    return {};
  });

  // Update URL when directory changes
  const handleDirectoryChange = (directory: string) => {
    setActiveDirectory(directory);
    const network = activeNetworks[directory] || getNetworksForDirectory(directory)[0];
    setSearchParams({ directory, network });
  };

  // Update URL when network changes
  const handleNetworkChange = (directory: string, network: string) => {
    setActiveNetworks(prev => ({ ...prev, [directory]: network }));
    setSearchParams({ directory, network });
  };

  // Set defaults when data loads
  useEffect(() => {
    if (availableDirectories.length > 0 && !activeDirectory) {
      const defaultDirectory = availableDirectories[0];
      const defaultNetwork = getNetworksForDirectory(defaultDirectory)[0];
      setActiveDirectory(defaultDirectory);
      setActiveNetworks({ [defaultDirectory]: defaultNetwork });
      setSearchParams({ directory: defaultDirectory, network: defaultNetwork });
    }
  }, [availableDirectories, activeDirectory]);

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


      {/* Syncoor Live Tests */}
      {config?.syncoorApiEndpoints && config.syncoorApiEndpoints.length > 0 && (
        <SyncoorTests endpoints={config.syncoorApiEndpoints} />
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Finished test runs:</h2>
        <Badge variant="outline">{total} total tests</Badge>
      </div>
      <div className="space-y-6">

        {reports.length === 0 ? (
          <Card className="p-6">
            <p className="text-muted-foreground">No test results found.</p>
          </Card>
        ) : (
          <Tabs value={activeDirectory || availableDirectories[0]} onValueChange={handleDirectoryChange} className="w-full">
            <TabsList className="mb-4">
              {availableDirectories.map(directory => (
                <TabsTrigger key={directory} value={directory}>
                  {directory}
                  <Badge variant="outline" className="ml-2">
                    {reports.filter(r => r.source_directory === directory).length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {availableDirectories.map(directory => {
              const networksForDirectory = getNetworksForDirectory(directory);
              const activeNetwork = activeNetworks[directory] || networksForDirectory[0];

              return (
                <TabsContent key={directory} value={directory} className="space-y-4">
                  <Tabs
                    value={activeNetwork}
                    onValueChange={(network) => handleNetworkChange(directory, network)}
                    className="w-full"
                  >
                    <TabsList className="mb-4">
                      {networksForDirectory.map(network => (
                        <TabsTrigger key={network} value={network}>
                          {network}
                          <Badge variant="outline" className="ml-2">
                            {reports.filter(r => r.source_directory === directory && r.network === network).length}
                          </Badge>
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {networksForDirectory.map(network => {
                      const filteredReports = reports.filter(r => r.source_directory === directory && r.network === network);
                      const grouped = groupReportsByDirectoryNetworkAndClient(filteredReports);
                      const clientGroups = grouped[directory]?.[network] || {};

                      return (
                        <TabsContent key={network} value={network} className="space-y-4">
                          <div className="grid gap-4">
                            {Object.entries(clientGroups)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([clientType, clientReports]) => (
                          <Card key={`${directory}-${network}-${clientType}`} className="p-4">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <img
                                    src={`/img/clients/${clientType}.jpg`}
                                    alt={`${clientType} logo`}
                                    className="w-8 h-8 rounded"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                  <h5 className="font-medium capitalize">{clientType}</h5>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary">{network}</Badge>
                                  <Badge variant="outline">{clientReports.length} tests</Badge>
                                </div>
                              </div>

                              {/* Stats Cards */}
                              {(() => {
                                const stats = calculateClientGroupStats(clientReports);
                                return (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                                    <Card className="p-3">
                                      <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Last Runtime</p>
                                        <p className="text-sm font-medium">
                                          {stats.lastRuntime ? formatTimestamp(stats.lastRuntime) : 'No data'}
                                        </p>
                                      </div>
                                    </Card>
                                    <Card className="p-3">
                                      <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Avg Duration</p>
                                        <p className="text-sm font-medium">
                                          {stats.avgDuration ? formatDuration(stats.avgDuration) : 'No data'}
                                        </p>
                                      </div>
                                    </Card>
                                    <Card className="p-3">
                                      <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Recent EL Disk Usage</p>
                                        <p className="text-sm font-medium">
                                          {stats.mostRecentDiskUsage ? formatBytes(stats.mostRecentDiskUsage, 1) : 'No data'}
                                        </p>
                                      </div>
                                    </Card>
                                  </div>
                                );
                              })()}

                              {/* Charts for client group */}
                              {clientReports.length > 1 && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                                  <div className="bg-muted/30 rounded-lg p-3">
                                    <ClientGroupDurationChart
                                      data={clientReports}
                                      height={300}
                                      color="#3b82f6"
                                      title={`Duration Trends`}
                                    />
                                  </div>
                                  <div className="bg-muted/30 rounded-lg p-3">
                                    <ClientGroupDiskChart
                                      data={clientReports}
                                      height={300}
                                      color="#10b981"
                                      title={`EL Disk Usage Trends`}
                                    />
                                  </div>
                                </div>
                              )}

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
                                        <td className="py-2 px-2">
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
                                        <td className="py-2 px-2">
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
                                  <Link to={`/tests?directory=${encodeURIComponent(directory)}&network=${encodeURIComponent(network)}&elClient=${encodeURIComponent(clientType)}`}>
                                    <div className="mt-3 p-3 rounded-lg border-dashed border-2 hover:bg-muted/50 transition-colors cursor-pointer text-center">
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
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </div>
  );
}

export { Dashboard };
