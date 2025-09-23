import { useMemo } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useReports } from '../hooks/useReports';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { formatDuration, formatTimestamp, formatBytes, getStatusBadgeInfo, getStatusIcon } from '../lib/utils';
import { useSearchParams, Link } from 'react-router-dom';

export default function TestList() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get all params from URL with defaults
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const sortBy = searchParams.get('sortBy') || 'timestamp';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';
  
  // Get filters from URL params
  const directoryFilter = searchParams.get('directory') || '';
  const networkFilter = searchParams.get('network') || '';
  // Legacy client filter (now split into elClient and clClient)
  const elClientFilter = searchParams.get('elClient') || '';
  const clClientFilter = searchParams.get('clClient') || '';
  const statusFilter = searchParams.get('status') || '';
  const minDuration = searchParams.get('minDuration') || '';
  const maxDuration = searchParams.get('maxDuration') || '';
  
  // Note: Filters are applied client-side in the useMemo below
  
  // Update URL params helper
  const updateUrlParams = (updates: Record<string, string | number>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === 0) {
        newParams.delete(key);
      } else {
        newParams.set(key, value.toString());
      }
    });
    // Reset to page 1 when filters change
    if (Object.keys(updates).some(key => key !== 'page' && key !== 'limit')) {
      newParams.set('page', '1');
    }
    setSearchParams(newParams);
  };
  
  // Handle sorting
  const handleSort = (column: string) => {
    const newSortOrder = sortBy === column && sortOrder === 'desc' ? 'asc' : 'desc';
    updateUrlParams({ sortBy: column, sortOrder: newSortOrder });
  };
  
  // Handle pagination
  const handlePageChange = (newPage: number) => {
    updateUrlParams({ page: newPage });
  };
  
  const handleLimitChange = (newLimit: number) => {
    updateUrlParams({ limit: newLimit, page: 1 });
  };

  const { data: config, isLoading: configLoading, error: configError } = useConfig();

  // Helper function to get display name for a directory
  const getDirectoryDisplayName = (directoryName: string) => {
    if (!config?.directories) return directoryName;
    const dir = config.directories.find(d => d.name === directoryName);
    return dir?.displayName || dir?.name || directoryName;
  };
  const {
    data: allReports,
    isLoading: reportsLoading,
    error: reportsError
  } = useReports({
    directories: config?.directories || [],
    pagination: { page: 1, limit: 10000, sortBy: 'timestamp', sortOrder: 'desc' }
  });
  
  // Get unique values for filter dropdowns
  const uniqueValues = useMemo(() => {
    if (!allReports) return { directories: [], networks: [], elClients: [], clClients: [], statuses: [] };
    
    return {
      directories: [...new Set(allReports.map(r => r.source_directory))].sort(),
      networks: [...new Set(allReports.map(r => r.network))].sort(),
      elClients: [...new Set(allReports.map(r => r.execution_client_info.type))].sort(),
      clClients: [...new Set(allReports.map(r => r.consensus_client_info.type))].sort(),
      statuses: [...new Set(allReports.map(r => r.sync_info.status || 'success'))].sort()
    };
  }, [allReports]);
  
  // Filter and sort reports client-side
  const filteredAndSortedReports = useMemo(() => {
    if (!allReports) return [];
    
    let filtered = allReports.filter(report => {
      if (directoryFilter && report.source_directory !== directoryFilter) return false;
      if (networkFilter && report.network !== networkFilter) return false;
      if (elClientFilter && report.execution_client_info.type !== elClientFilter) return false;
      if (clClientFilter && report.consensus_client_info.type !== clClientFilter) return false;
      if (statusFilter && (report.sync_info.status || 'success') !== statusFilter) return false;
      if (minDuration && report.sync_info.duration < parseInt(minDuration)) return false;
      if (maxDuration && report.sync_info.duration > parseInt(maxDuration)) return false;
      return true;
    });
    
    // Sort
    filtered.sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      
      switch (sortBy) {
        case 'timestamp':
          aVal = Number(a.timestamp);
          bVal = Number(b.timestamp);
          break;
        case 'duration':
          aVal = a.sync_info.duration;
          bVal = b.sync_info.duration;
          break;
        case 'network':
          aVal = a.network;
          bVal = b.network;
          break;
        case 'execution_client':
          aVal = a.execution_client_info.type;
          bVal = b.execution_client_info.type;
          break;
        case 'consensus_client':
          aVal = a.consensus_client_info.type;
          bVal = b.consensus_client_info.type;
          break;
        case 'block':
          aVal = a.sync_info.block;
          bVal = b.sync_info.block;
          break;
        case 'slot':
          aVal = a.sync_info.slot;
          bVal = b.sync_info.slot;
          break;
        case 'el_disk':
          aVal = a.sync_info.last_entry?.de || 0;
          bVal = b.sync_info.last_entry?.de || 0;
          break;
        case 'cl_disk':
          aVal = a.sync_info.last_entry?.dc || 0;
          bVal = b.sync_info.last_entry?.dc || 0;
          break;
        case 'el_peers':
          aVal = a.sync_info.last_entry?.pe || 0;
          bVal = b.sync_info.last_entry?.pe || 0;
          break;
        case 'cl_peers':
          aVal = a.sync_info.last_entry?.pc || 0;
          bVal = b.sync_info.last_entry?.pc || 0;
          break;
        case 'status':
          aVal = a.sync_info.status || 'unknown';
          bVal = b.sync_info.status || 'unknown';
          break;
        default:
          aVal = Number(a.timestamp);
          bVal = Number(b.timestamp);
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    
    return filtered;
  }, [allReports, directoryFilter, networkFilter, elClientFilter, clClientFilter, statusFilter, minDuration, maxDuration, sortBy, sortOrder]);
  
  // Paginate results
  const total = filteredAndSortedReports.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const reports = filteredAndSortedReports.slice(startIndex, startIndex + limit);

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
          {(directoryFilter || networkFilter || elClientFilter || clClientFilter || statusFilter || minDuration || maxDuration) && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-muted-foreground">Filtered by:</span>
              {directoryFilter && <Badge variant="outline">{directoryFilter}</Badge>}
              {networkFilter && <Badge variant="secondary">{networkFilter}</Badge>}
              {elClientFilter && <Badge variant="default">EL: {elClientFilter}</Badge>}
              {clClientFilter && <Badge variant="default">CL: {clClientFilter}</Badge>}
              {statusFilter && <Badge variant={getStatusBadgeInfo(statusFilter).variant}>{getStatusBadgeInfo(statusFilter).text}</Badge>}
              {minDuration && <Badge variant="outline">Min: {formatDuration(parseInt(minDuration))}</Badge>}
              {maxDuration && <Badge variant="outline">Max: {formatDuration(parseInt(maxDuration))}</Badge>}
            </div>
          )}
        </div>
        <Badge variant="outline">{total} total tests</Badge>
      </div>

      <Card className="p-6">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Directory</label>
            <Select value={directoryFilter || "__all__"} onValueChange={(value) => updateUrlParams({ directory: value === "__all__" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Directories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Directories</SelectItem>
                {uniqueValues.directories.map(dir => (
                  <SelectItem key={dir} value={dir}>{getDirectoryDisplayName(dir)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Network</label>
            <Select value={networkFilter || "__all__"} onValueChange={(value) => updateUrlParams({ network: value === "__all__" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Networks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Networks</SelectItem>
                {uniqueValues.networks.map(network => (
                  <SelectItem key={network} value={network}>{network}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">EL Client</label>
            <Select value={elClientFilter || "__all__"} onValueChange={(value) => updateUrlParams({ elClient: value === "__all__" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder="All EL Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All EL Clients</SelectItem>
                {uniqueValues.elClients.map(client => (
                  <SelectItem key={client} value={client}>
                    <span className="capitalize">{client}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">CL Client</label>
            <Select value={clClientFilter || "__all__"} onValueChange={(value) => updateUrlParams({ clClient: value === "__all__" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder="All CL Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All CL Clients</SelectItem>
                {uniqueValues.clClients.map(client => (
                  <SelectItem key={client} value={client}>
                    <span className="capitalize">{client}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select value={statusFilter || "__all__"} onValueChange={(value) => updateUrlParams({ status: value === "__all__" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Statuses</SelectItem>
                {uniqueValues.statuses.map(status => (
                  <SelectItem key={status} value={status}>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(status)}
                      <span className="capitalize">{getStatusBadgeInfo(status).text}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Duration filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Min Duration (seconds)</label>
            <input 
              type="number" 
              value={minDuration} 
              onChange={(e) => updateUrlParams({ minDuration: e.target.value })}
              className="flex h-9 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="e.g. 3600"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Max Duration (seconds)</label>
            <input 
              type="number" 
              value={maxDuration} 
              onChange={(e) => updateUrlParams({ maxDuration: e.target.value })}
              className="flex h-9 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="e.g. 43200"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Results per page</label>
            <Select value={limit.toString()} onValueChange={(value) => handleLimitChange(Number(value))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="20">20 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
                <SelectItem value="200">200 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Clear filters button */}
        {(directoryFilter || networkFilter || elClientFilter || clClientFilter || statusFilter || minDuration || maxDuration) && (
          <div className="mb-6">
            <Button
              variant="outline"
              onClick={() => setSearchParams({ sortBy, sortOrder, page: '1', limit: limit.toString() })}
              className="text-sm"
            >
              Clear all filters
            </Button>
          </div>
        )}

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
                    <th className="text-left py-3 px-3">
                      <button 
                        onClick={() => handleSort('timestamp')}
                        className="flex items-center gap-1 hover:text-foreground font-medium"
                      >
                        Timestamp
                        {sortBy === 'timestamp' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left py-3 px-3">
                      <button 
                        onClick={() => handleSort('execution_client')}
                        className="flex items-center gap-1 hover:text-foreground font-medium"
                      >
                        EL
                        {sortBy === 'execution_client' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left py-3 px-3">
                      <button 
                        onClick={() => handleSort('consensus_client')}
                        className="flex items-center gap-1 hover:text-foreground font-medium"
                      >
                        CL
                        {sortBy === 'consensus_client' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-right py-3 px-3">
                      <button 
                        onClick={() => handleSort('block')}
                        className="flex items-center gap-1 hover:text-foreground font-medium ml-auto"
                      >
                        Block
                        {sortBy === 'block' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-right py-3 px-3">
                      <button 
                        onClick={() => handleSort('slot')}
                        className="flex items-center gap-1 hover:text-foreground font-medium ml-auto"
                      >
                        Slot
                        {sortBy === 'slot' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-right py-3 px-3">
                      <button 
                        onClick={() => handleSort('el_disk')}
                        className="flex items-center gap-1 hover:text-foreground font-medium ml-auto"
                      >
                        EL Disk
                        {sortBy === 'el_disk' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-right py-3 px-3">
                      <button 
                        onClick={() => handleSort('cl_disk')}
                        className="flex items-center gap-1 hover:text-foreground font-medium ml-auto"
                      >
                        CL Disk
                        {sortBy === 'cl_disk' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-center py-3 px-3">
                      <button 
                        onClick={() => handleSort('el_peers')}
                        className="flex items-center gap-1 hover:text-foreground font-medium mx-auto"
                      >
                        EL Peers
                        {sortBy === 'el_peers' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-center py-3 px-3">
                      <button 
                        onClick={() => handleSort('cl_peers')}
                        className="flex items-center gap-1 hover:text-foreground font-medium mx-auto"
                      >
                        CL Peers
                        {sortBy === 'cl_peers' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-right py-3 px-3">
                      <button 
                        onClick={() => handleSort('duration')}
                        className="flex items-center gap-1 hover:text-foreground font-medium ml-auto"
                      >
                        Duration
                        {sortBy === 'duration' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-center py-3 px-3">
                      <button 
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1 hover:text-foreground font-medium mx-auto"
                      >
                        Status
                        {sortBy === 'status' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left py-3 px-3">
                      <button 
                        onClick={() => handleSort('network')}
                        className="flex items-center gap-1 hover:text-foreground font-medium"
                      >
                        Network/Directory
                        {sortBy === 'network' && (
                          <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr
                      key={report.run_id}
                      className="border-b hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3 px-3 text-muted-foreground">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="block -m-3 p-3"
                        >
                          {formatTimestamp(Number(report.timestamp))}
                        </Link>
                      </td>
                      <td className="py-3 px-3">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="flex items-center gap-1 -m-3 p-3"
                        >
                          <img
                            src={`img/clients/${report.execution_client_info.type}.jpg`}
                            alt={`${report.execution_client_info.type} logo`}
                            className="w-5 h-5 rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <span className="font-medium capitalize">{report.execution_client_info.type}</span>
                        </Link>
                      </td>
                      <td className="py-3 px-3">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="flex items-center gap-1 -m-3 p-3"
                        >
                          <img
                            src={`img/clients/${report.consensus_client_info.type}.jpg`}
                            alt={`${report.consensus_client_info.type} logo`}
                            className="w-5 h-5 rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <span className="font-medium capitalize">{report.consensus_client_info.type}</span>
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="block -m-3 p-3"
                        >
                          {report.sync_info.block.toLocaleString()}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="block -m-3 p-3"
                        >
                          {report.sync_info.slot.toLocaleString()}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="block -m-3 p-3"
                        >
                          {report.sync_info.last_entry ? formatBytes(report.sync_info.last_entry.de, 1) : '-'}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="block -m-3 p-3"
                        >
                          {report.sync_info.last_entry ? formatBytes(report.sync_info.last_entry.dc, 1) : '-'}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-center text-muted-foreground">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="block -m-3 p-3"
                        >
                          {report.sync_info.last_entry ? report.sync_info.last_entry.pe : '-'}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-center text-muted-foreground">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="block -m-3 p-3"
                        >
                          {report.sync_info.last_entry ? report.sync_info.last_entry.pc : '-'}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="block -m-3 p-3"
                        >
                          {formatDuration(report.sync_info.duration)}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="flex items-center justify-center -m-3 p-3"
                        >
                          <Badge
                            variant={getStatusBadgeInfo(report.sync_info.status).variant}
                            className="flex items-center gap-1"
                          >
                            {getStatusIcon(report.sync_info.status)}
                            {getStatusBadgeInfo(report.sync_info.status).text}
                          </Badge>
                        </Link>
                      </td>
                      <td className="py-3 px-3">
                        <Link
                          to={`/test/${report.source_directory}/${report.run_id}`}
                          className="block -m-3 p-3"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{report.network}</Badge>
                            <Badge variant="secondary">{report.source_display_name || report.source_directory}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{report.run_id}</div>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1}-{Math.min(startIndex + limit, total)} of {total} tests
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(1)}
                  disabled={page === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                
                {/* Page numbers */}
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                        className="w-8 h-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={page === totalPages}
                >
                  Last
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