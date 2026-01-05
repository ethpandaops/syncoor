import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import InstanceGrid from '../components/controlcenter/InstanceGrid';
import AggregatedTestTable from '../components/controlcenter/AggregatedTestTable';
import GitHubQueueSection from '../components/controlcenter/GitHubQueueSection';
import { useCCStatus, useCCTests, useCCGitHubQueue } from '../hooks/useControlCenter';
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

  const { data: status, isLoading: statusLoading, error: statusError } = useCCStatus(endpoint);
  const { data: tests, isLoading: testsLoading, error: testsError } = useCCTests(endpoint, {
    ...filters,
    active: activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined,
    instance: instanceFilter !== 'all' ? instanceFilter : undefined,
  });
  const { data: allTestsData } = useCCTests(endpoint, { page_size: 200 });
  const { data: githubQueue } = useCCGitHubQueue(endpoint);

  // Calculate connected count for stats card
  const githubConnectedCount = useMemo(() => {
    if (!allTestsData?.tests || !githubQueue?.workflows) return 0;

    const connectedJobIds = new Set<string>();
    for (const test of allTestsData.tests) {
      const jobId = test.labels?.['github.job_id'];
      if (jobId) {
        connectedJobIds.add(jobId);
      }
    }

    let count = 0;
    for (const workflow of githubQueue.workflows) {
      for (const job of workflow.jobs) {
        if (connectedJobIds.has(String(job.id))) {
          count++;
        }
      }
    }
    return count;
  }, [allTestsData, githubQueue]);

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

  // Get unique instance names for filter
  const instanceNames = status?.instances.map(i => i.name) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Control Center</h1>
        <p className="text-muted-foreground text-sm">
          Aggregated view of all Syncoor instances
        </p>
      </div>

      {/* Summary Stats */}
      {status && (() => {
        const hasGitHubJobs = status.github_queued > 0 || status.github_running > 0;
        return (
          <div className={`grid grid-cols-1 gap-4 ${hasGitHubJobs ? 'md:grid-cols-2' : ''}`}>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold flex items-baseline gap-1">
                  <span className="text-green-600 dark:text-green-400">{status.healthy_instances}</span>
                  <span className="text-muted-foreground text-lg">/</span>
                  <span>{status.instances.length}</span>
                </div>
                <div className="text-xs text-muted-foreground">Syncoor Instances<br />(Healthy/Total)</div>
              </CardContent>
            </Card>
            {hasGitHubJobs && (
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold flex items-baseline gap-1">
                    <span className="text-yellow-600 dark:text-yellow-400">{status.github_queued}</span>
                    <span className="text-muted-foreground text-lg">/</span>
                    <span className="text-blue-600 dark:text-blue-400">{status.github_running}</span>
                    <span className="text-muted-foreground text-lg">/</span>
                    <span className="text-green-600 dark:text-green-400">{githubConnectedCount}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">GitHub Jobs<br />(Queued/Running/Connected)</div>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}

      {/* Instance Grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ServerIcon className="h-5 w-5" />
            Syncoor Instances
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <InstanceGrid
            instances={status?.instances || []}
            isLoading={statusLoading}
            error={statusError}
          />
        </CardContent>
      </Card>

      {/* GitHub Queue Section */}
      <GitHubQueueSection endpoint={endpoint} />

      {/* Tests Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ListIcon className="h-5 w-5" />
              Connected Runs
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
        <CardContent className="pt-0">
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
