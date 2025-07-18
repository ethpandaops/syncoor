import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useConfig } from '../hooks/useConfig';
import { useReports } from '../hooks/useReports';
import { useProgressData } from '../hooks/useProgressData';
import { useMainReport } from '../hooks/useMainReport';
import { formatDuration, formatTimestamp } from '../lib/utils';
import { BlockProgressChart, SlotProgressChart, DiskUsageChart, PeerCountChart } from '../components/charts';

export default function TestDetails() {
  const { id } = useParams<{ id: string }>();
  const [showExecutionDetails, setShowExecutionDetails] = useState(false);
  const [showConsensusDetails, setShowConsensusDetails] = useState(false);
  const { data: config, isLoading: configLoading } = useConfig();
  const { data: reports, isLoading: reportsLoading } = useReports({
    directories: config?.directories || [],
    pagination: { page: 1, limit: 1000, sortBy: 'timestamp', sortOrder: 'desc' }
  });

  // Find the specific test report (do this before hooks to ensure consistent hook calls)
  const testReport = reports?.find(report => report.run_id === id);

  // Fetch progress data - always call the hook but conditionally enable it
  const progressUrl = testReport ? `${testReport.source_url}${testReport.progress_file}` : '';
  const { data: progressData, isLoading: progressLoading, error: progressError } = useProgressData({
    progressUrl,
    enabled: !!testReport && !configLoading && !reportsLoading
  });

  // Fetch main report data for detailed client information
  const mainUrl = testReport ? `${testReport.source_url}${testReport.main_file}` : '';
  const { data: mainReport, isLoading: mainLoading, error: mainError } = useMainReport({
    mainUrl,
    enabled: !!testReport && !configLoading && !reportsLoading
  });

  if (configLoading || reportsLoading || mainLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Test Details</h1>
          <Link to="/tests">
            <Button variant="outline">Back to Tests</Button>
          </Link>
        </div>
        <Card className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </Card>
      </div>
    );
  }

  if (!testReport) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Test Details</h1>
          <Link to="/tests">
            <Button variant="outline">Back to Tests</Button>
          </Link>
        </div>
        <Card className="p-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Test Not Found</h3>
            <p className="text-muted-foreground">The test with ID "{id}" could not be found.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Test Details</h1>
            <Badge variant="outline">{testReport.network}</Badge>
          </div>
          <p className="text-muted-foreground">
            {testReport.execution_client_info.name} + {testReport.consensus_client_info.name}
          </p>
        </div>
        <Link to="/tests">
          <Button variant="outline">Back to Tests</Button>
        </Link>
      </div>

      {/* Test Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Duration</span>
            <span className="text-2xl font-bold">{formatDuration(testReport.sync_info.duration)}</span>
            <span className="text-xs text-muted-foreground">Total sync time</span>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Final Block</span>
            <span className="text-2xl font-bold">{testReport.sync_info.block.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">Blocks synced</span>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Final Slot</span>
            <span className="text-2xl font-bold">{testReport.sync_info.slot.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">Slots synced</span>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Progress Entries</span>
            <span className="text-2xl font-bold">{testReport.sync_info.entries_count}</span>
            <span className="text-xs text-muted-foreground">Data points</span>
          </div>
        </Card>
      </div>

      {/* Client Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Execution Client</CardTitle>
              <Badge variant="secondary">{mainReport?.execution_client_info.type || testReport.execution_client_info.type}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-muted-foreground">Name</span>
                <div className="text-sm font-medium mt-1">{mainReport?.execution_client_info.name || testReport.execution_client_info.name}</div>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Version</span>
                <div className="text-sm font-mono mt-1">{mainReport?.execution_client_info.version || testReport.execution_client_info.version}</div>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Image</span>
                <div className="text-sm font-mono mt-1">{mainReport?.execution_client_info.image || testReport.execution_client_info.image}</div>
              </div>
              {(mainReport?.execution_client_info.entrypoint || mainReport?.execution_client_info.cmd) && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowExecutionDetails(!showExecutionDetails)}
                    className="flex items-center gap-2 h-8 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ChevronIcon className={`h-4 w-4 transition-transform ${showExecutionDetails ? 'rotate-90' : ''}`} />
                    Command Details
                  </Button>
                  {showExecutionDetails && (
                    <div className="pl-6 space-y-3">
                      {mainReport?.execution_client_info.entrypoint && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Entrypoint:</div>
                          <div className="text-sm font-mono bg-muted p-3 rounded-sm break-all">
                            {mainReport.execution_client_info.entrypoint.join(' ')}
                          </div>
                        </div>
                      )}
                      {mainReport?.execution_client_info.cmd && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Cmd:</div>
                          <div className="text-sm font-mono bg-muted p-3 rounded-sm break-all whitespace-pre-wrap">
                            {mainReport.execution_client_info.cmd.join(' ')}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Consensus Client</CardTitle>
              <Badge variant="secondary">{mainReport?.consensus_client_info.type || testReport.consensus_client_info.type}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-muted-foreground">Name</span>
                <div className="text-sm font-medium mt-1">{mainReport?.consensus_client_info.name || testReport.consensus_client_info.name}</div>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Version</span>
                <div className="text-sm font-mono mt-1">{mainReport?.consensus_client_info.version || testReport.consensus_client_info.version}</div>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Image</span>
                <div className="text-sm font-mono mt-1">{mainReport?.consensus_client_info.image || testReport.consensus_client_info.image}</div>
              </div>
              {(mainReport?.consensus_client_info.entrypoint || mainReport?.consensus_client_info.cmd) && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConsensusDetails(!showConsensusDetails)}
                    className="flex items-center gap-2 h-8 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ChevronIcon className={`h-4 w-4 transition-transform ${showConsensusDetails ? 'rotate-90' : ''}`} />
                    Command Details
                  </Button>
                  {showConsensusDetails && (
                    <div className="pl-6 space-y-3">
                      {mainReport?.consensus_client_info.entrypoint && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Entrypoint:</div>
                          <div className="text-sm font-mono bg-muted p-3 rounded-sm break-all">
                            {mainReport.consensus_client_info.entrypoint.join(' ')}
                          </div>
                        </div>
                      )}
                      {mainReport?.consensus_client_info.cmd && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Cmd:</div>
                          <div className="text-sm font-mono bg-muted p-3 rounded-sm break-all whitespace-pre-wrap">
                            {mainReport.consensus_client_info.cmd.join(' ')}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Test Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Run ID</span>
                <span className="text-sm font-mono">{testReport.run_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Network</span>
                <Badge variant="outline">{testReport.network}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Source</span>
                <Badge variant="secondary">{testReport.source_directory}</Badge>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Start Time</span>
                <span className="text-sm">{formatTimestamp(Number(testReport.sync_info.start))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">End Time</span>
                <span className="text-sm">{formatTimestamp(Number(testReport.sync_info.end))}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Charts */}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Progress Over Time</h2>
        
        {progressLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-muted rounded w-1/3"></div>
                    <div className="h-64 bg-muted rounded"></div>
                  </div>
                </Card>
              ))}
            </div>
        ) : progressError ? (
          <Card className="p-6">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">Unable to load progress data</p>
              <p className="text-sm">{progressError.message}</p>
            </div>
          </Card>
        ) : progressData && progressData.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Execution Block Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <BlockProgressChart 
                      data={progressData} 
                      color="#3b82f6"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Consensus Slot Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <SlotProgressChart 
                      data={progressData} 
                      color="#10b981"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Disk Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <DiskUsageChart data={progressData} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Peer Connections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <PeerCountChart data={progressData} />
                  </div>
                </CardContent>
              </Card>
            </div>
        ) : (
          <Card className="p-6">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">No progress data available</p>
              <p className="text-sm">This test may not have recorded detailed progress information</p>
            </div>
          </Card>
        )}
      </div>

      {/* File Information */}
      <Card>
        <CardHeader>
          <CardTitle>Report Files</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Main Report</span>
              <a 
                href={`${testReport.source_url}${testReport.main_file}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 font-mono"
              >
                {testReport.main_file}
              </a>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Progress Report</span>
              <a 
                href={`${testReport.source_url}${testReport.progress_file}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 font-mono"
              >
                {testReport.progress_file}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Chevron icon component for collapsible sections
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}