import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../components/ui/table';
import { 
  SyncProgressChart, 
  DiskUsageChart, 
  PeerCountChart, 
  PerformanceMatrix 
} from '../components/charts';
import { useReports, useConfig, useTestDetails } from '../hooks';
import { ReportEntry } from '../hooks/useReports';
import { TestDetails } from '../hooks/useTestDetails';
import { formatDuration, formatBytes } from '../lib/utils';

interface CompareProps {
  onTestClick?: (runId: string) => void;
}

interface TestSelector {
  report: ReportEntry;
  selected: boolean;
  details?: TestDetails;
}

const TestSelectorRow: React.FC<{
  testSelector: TestSelector;
  onToggle: (runId: string) => void;
}> = ({ testSelector, onToggle }) => {
  const { report, selected } = testSelector;
  
  const getStatusColor = (report: ReportEntry) => {
    const now = new Date();
    const endTime = new Date(report.sync_info.end);
    const startTime = new Date(report.sync_info.start);
    
    if (endTime.getTime() > startTime.getTime() && endTime < now) {
      return 'success';
    }
    return 'secondary';
  };

  return (
    <TableRow className={selected ? 'bg-muted/50' : ''}>
      <TableCell>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(report.run_id)}
          className="rounded border-gray-300 text-primary focus:ring-primary"
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">
            {new Date(report.timestamp).toLocaleDateString()}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(report.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{report.network}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{report.execution_client_info.name}</span>
          <span className="text-xs text-muted-foreground">
            {report.execution_client_info.version}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{report.consensus_client_info.name}</span>
          <span className="text-xs text-muted-foreground">
            {report.consensus_client_info.version}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <span className="font-medium">
          {formatDuration(report.sync_info.duration)}
        </span>
      </TableCell>
      <TableCell>
        <span className="font-medium">
          {report.sync_info.block.toLocaleString()}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={getStatusColor(report) as any}>
          {report.sync_info.end > report.sync_info.start ? 'Completed' : 'Running'}
        </Badge>
      </TableCell>
    </TableRow>
  );
};

const ComparisonTable: React.FC<{
  selectedTests: TestSelector[];
  onRemove: (runId: string) => void;
}> = ({ selectedTests, onRemove }) => {
  if (selectedTests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            Select tests to compare them side by side
          </div>
        </CardContent>
      </Card>
    );
  }

  const metrics = selectedTests.map(test => ({
    report: test.report,
    details: test.details
  }));

  return (
    <div className="space-y-6">
      {/* Summary Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Test Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Metric</th>
                  {selectedTests.map((test) => (
                    <th key={test.report.run_id} className="text-left p-2 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{test.report.execution_client_info.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemove(test.report.run_id)}
                          className="h-6 w-6 p-0"
                        >
                          ×
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground font-normal">
                        {new Date(test.report.timestamp).toLocaleDateString()}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-2 font-medium">Network</td>
                  {selectedTests.map((test) => (
                    <td key={test.report.run_id} className="p-2">
                      <Badge variant="outline">{test.report.network}</Badge>
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Execution Client</td>
                  {selectedTests.map((test) => (
                    <td key={test.report.run_id} className="p-2">
                      <div className="flex flex-col">
                        <span>{test.report.execution_client_info.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {test.report.execution_client_info.version}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Consensus Client</td>
                  {selectedTests.map((test) => (
                    <td key={test.report.run_id} className="p-2">
                      <div className="flex flex-col">
                        <span>{test.report.consensus_client_info.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {test.report.consensus_client_info.version}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Duration</td>
                  {selectedTests.map((test) => (
                    <td key={test.report.run_id} className="p-2">
                      <span className="font-medium">
                        {formatDuration(test.report.sync_info.duration)}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Blocks Synced</td>
                  {selectedTests.map((test) => (
                    <td key={test.report.run_id} className="p-2">
                      <span className="font-medium">
                        {test.report.sync_info.block.toLocaleString()}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Average Blocks/sec</td>
                  {selectedTests.map((test) => (
                    <td key={test.report.run_id} className="p-2">
                      <span className="font-medium">
                        {test.details?.metrics.averageBlocksPerSecond.toFixed(2) || 'N/A'}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Peak Blocks/sec</td>
                  {selectedTests.map((test) => (
                    <td key={test.report.run_id} className="p-2">
                      <span className="font-medium">
                        {test.details?.metrics.peakBlocksPerSecond.toFixed(2) || 'N/A'}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Total DB Size</td>
                  {selectedTests.map((test) => (
                    <td key={test.report.run_id} className="p-2">
                      <span className="font-medium">
                        {test.details?.metrics.totalDbSize 
                          ? formatBytes(test.details.metrics.totalDbSize)
                          : 'N/A'}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2 font-medium">Progress</td>
                  {selectedTests.map((test) => (
                    <td key={test.report.run_id} className="p-2">
                      <span className="font-medium">
                        {test.details?.metrics.progressPercentage.toFixed(1) || 'N/A'}%
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sync Progress Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <SyncProgressChart 
                data={selectedTests[0]?.report.sync_info}
                progress={selectedTests[0]?.details?.progress || []}
                comparisons={selectedTests.slice(1).map(test => ({
                  data: test.report.sync_info,
                  progress: test.details?.progress || [],
                  label: test.report.execution_client_info.name
                }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Disk Usage Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <DiskUsageChart 
                progress={selectedTests[0]?.details?.progress || []}
                comparisons={selectedTests.slice(1).map(test => ({
                  progress: test.details?.progress || [],
                  label: test.report.execution_client_info.name
                }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Peer Count Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <PeerCountChart 
                progress={selectedTests[0]?.details?.progress || []}
                comparisons={selectedTests.slice(1).map(test => ({
                  progress: test.details?.progress || [],
                  label: test.report.execution_client_info.name
                }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <PerformanceMatrix 
                reports={selectedTests.map(test => test.report)} 
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export const Compare: React.FC<CompareProps> = ({ onTestClick }) => {
  const { data: config } = useConfig();
  const { data: reports, isLoading, error } = useReports({
    directories: config?.directories || [],
    pagination: { page: 1, limit: 100, sortBy: 'timestamp', sortOrder: 'desc' }
  });

  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [showSelected, setShowSelected] = useState(false);

  // Load test details for selected tests
  const selectedTests = useMemo(() => {
    return reports
      .filter(report => selectedRunIds.includes(report.run_id))
      .map(report => ({
        report,
        selected: true,
        details: undefined // We'll load this with individual hooks
      }));
  }, [reports, selectedRunIds]);

  const handleToggleSelection = (runId: string) => {
    setSelectedRunIds(prev => 
      prev.includes(runId) 
        ? prev.filter(id => id !== runId)
        : [...prev, runId]
    );
  };

  const handleRemoveFromComparison = (runId: string) => {
    setSelectedRunIds(prev => prev.filter(id => id !== runId));
  };

  const handleClearSelection = () => {
    setSelectedRunIds([]);
  };

  const displayedReports = showSelected 
    ? reports.filter(report => selectedRunIds.includes(report.run_id))
    : reports;

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-red-600">
          <p>Error loading test data: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Compare Tests</h1>
          <p className="text-muted-foreground">
            Select tests to compare their performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showSelected ? "default" : "outline"}
            onClick={() => setShowSelected(!showSelected)}
            disabled={selectedRunIds.length === 0}
          >
            {showSelected ? "Show All" : "Show Selected"} 
            {selectedRunIds.length > 0 && ` (${selectedRunIds.length})`}
          </Button>
          {selectedRunIds.length > 0 && (
            <Button variant="outline" onClick={handleClearSelection}>
              Clear Selection
            </Button>
          )}
        </div>
      </div>

      {/* Selection Info */}
      {selectedRunIds.length > 0 && (
        <div className="bg-muted/50 p-4 rounded-sm">
          <p className="text-sm font-medium">
            {selectedRunIds.length} test{selectedRunIds.length !== 1 ? 's' : ''} selected for comparison
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            You can select up to 5 tests to compare. Selected tests will appear in the comparison section below.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Test Selection */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              Select Tests to Compare
              {selectedRunIds.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({selectedRunIds.length} selected)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-muted-foreground">Loading tests...</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Network</TableHead>
                      <TableHead>Execution</TableHead>
                      <TableHead>Consensus</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Blocks</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedReports.map((report) => (
                      <TestSelectorRow
                        key={report.run_id}
                        testSelector={{
                          report,
                          selected: selectedRunIds.includes(report.run_id)
                        }}
                        onToggle={handleToggleSelection}
                      />
                    ))}
                  </TableBody>
                </Table>
                
                {displayedReports.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {showSelected 
                      ? "No tests selected for comparison."
                      : "No tests available for comparison."
                    }
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Tests</span>
                <span className="font-medium">{reports.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Selected</span>
                <span className="font-medium">{selectedRunIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Networks</span>
                <span className="font-medium">
                  {new Set(reports.map(r => r.network)).size}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Execution Clients</span>
                <span className="font-medium">
                  {new Set(reports.map(r => r.execution_client_info.name)).size}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Consensus Clients</span>
                <span className="font-medium">
                  {new Set(reports.map(r => r.consensus_client_info.name)).size}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Results */}
      <ComparisonTable 
        selectedTests={selectedTests}
        onRemove={handleRemoveFromComparison}
      />
    </div>
  );
};

export default Compare;