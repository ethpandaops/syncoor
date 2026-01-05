import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import InstanceGrid from '../components/controlcenter/InstanceGrid';
import AggregatedTestTable from '../components/controlcenter/AggregatedTestTable';
import { useCCStatus, useCCTests } from '../hooks/useControlCenter';
import { CCTestFilters } from '../types/controlCenter';

interface ControlCenterProps {
  endpoint: string;
}

const ControlCenter: React.FC<ControlCenterProps> = ({ endpoint }) => {
  const [filters, setFilters] = useState<CCTestFilters>({
    page: 1,
    page_size: 25,
    sort_by: 'start_time',
    sort_order: 'desc',
  });

  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [instanceFilter, setInstanceFilter] = useState<string>('all');

  const { data: status, isLoading: statusLoading, error: statusError, refetch: refetchStatus } = useCCStatus(endpoint);
  const { data: tests, isLoading: testsLoading, error: testsError } = useCCTests(endpoint, {
    ...filters,
    active: activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined,
    instance: instanceFilter !== 'all' ? instanceFilter : undefined,
  });

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleActiveFilterChange = (value: string) => {
    setActiveFilter(value);
    setFilters(prev => ({ ...prev, page: 1 }));
  };

  const handleInstanceFilterChange = (value: string) => {
    setInstanceFilter(value);
    setFilters(prev => ({ ...prev, page: 1 }));
  };

  const handleRefresh = () => {
    refetchStatus();
  };

  // Get unique instance names for filter
  const instanceNames = status?.instances.map(i => i.name) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Control Center</h1>
          <p className="text-muted-foreground text-sm">
            Aggregated view of all Syncoor instances
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshIcon className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{status.instances.length}</div>
              <div className="text-xs text-muted-foreground">Instances</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {status.healthy_instances}
              </div>
              <div className="text-xs text-muted-foreground">Healthy</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {status.active_tests}
              </div>
              <div className="text-xs text-muted-foreground">Active Tests</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{status.total_tests}</div>
              <div className="text-xs text-muted-foreground">Total Tests</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Instance Grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ServerIcon className="h-5 w-5" />
            Instances
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InstanceGrid
            instances={status?.instances || []}
            isLoading={statusLoading}
            error={statusError}
          />
        </CardContent>
      </Card>

      {/* Tests Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ListIcon className="h-5 w-5" />
              All Tests
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={activeFilter} onValueChange={handleActiveFilterChange}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Completed</SelectItem>
                </SelectContent>
              </Select>
              {instanceNames.length > 1 && (
                <Select value={instanceFilter} onValueChange={handleInstanceFilterChange}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Instance" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Instances</SelectItem>
                    {instanceNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AggregatedTestTable
            data={tests}
            isLoading={testsLoading}
            error={testsError}
            onPageChange={handlePageChange}
            endpoint={endpoint}
          />
        </CardContent>
      </Card>
    </div>
  );
};

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

export default ControlCenter;
