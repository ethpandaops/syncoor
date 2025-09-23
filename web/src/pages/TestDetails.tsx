import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useConfig } from '../hooks/useConfig';
import { useReports } from '../hooks/useReports';
import { useProgressData } from '../hooks/useProgressData';
import { useMainReport } from '../hooks/useMainReport';
import { formatDuration, formatTimestamp, getStatusBadgeInfo, getStatusIcon, formatBytes } from '../lib/utils';
import { extractFileFromDump } from '../lib/api';
import { SystemInformation } from '../components/SystemInformation';
import { GithubActionsInfo } from '../components/GithubActionsInfo';
import { useDumpFileInfo } from '../hooks/useDumpFile';
import ProgressCharts from '../components/ProgressCharts';

export default function TestDetails() {
  const { id, directory } = useParams<{ id: string; directory: string }>();
  const [showExecutionDetails, setShowExecutionDetails] = useState(false);
  const [showConsensusDetails, setShowConsensusDetails] = useState(false);
  const [showExecutionEnvVars, setShowExecutionEnvVars] = useState(false);
  const [showConsensusEnvVars, setShowConsensusEnvVars] = useState(false);
  const { data: config, isLoading: configLoading } = useConfig();

  // If directory is provided in URL, only fetch from that directory
  const targetDirectories = directory && config?.directories
    ? config.directories.filter(dir => dir.name === directory)
    : config?.directories || [];

  const { data: reports, isLoading: reportsLoading } = useReports({
    directories: targetDirectories,
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
  const { data: mainReport, isLoading: mainLoading } = useMainReport({
    mainUrl,
    enabled: !!testReport && !configLoading && !reportsLoading
  });

  // Get detailed dump file information
  const { zipInfo: dumpInfo, loading: dumpLoading, error: dumpError } = useDumpFileInfo({
    sourceUrl: testReport?.source_url,
    runId: testReport?.run_id,
    network: testReport?.network,
    elClient: testReport?.execution_client_info.type,
    clClient: testReport?.consensus_client_info.type,
    enabled: !!testReport && !configLoading && !reportsLoading
  });

  const downloadLogFile = async (filePath: string, fileName: string) => {
    if (!testReport) return;
    
    try {
      const blob = await extractFileFromDump(
        testReport.source_url,
        testReport.run_id,
        testReport.network,
        testReport.execution_client_info.type,
        testReport.consensus_client_info.type,
        filePath
      );
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      // Failed to download log file - ignore silently
    }
  };

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
            <p className="text-muted-foreground">The test with ID "{id}" could not be found{directory ? ` in directory "${directory}"` : ''}.</p>
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
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="flex items-center gap-1">
              <img 
                src={`img/clients/${testReport.execution_client_info.type}.jpg`} 
                alt={`${testReport.execution_client_info.type} logo`}
                className="w-5 h-5 rounded"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span>{testReport.execution_client_info.name}</span>
            </div>
            <span>+</span>
            <div className="flex items-center gap-1">
              <img 
                src={`img/clients/${testReport.consensus_client_info.type}.jpg`} 
                alt={`${testReport.consensus_client_info.type} logo`}
                className="w-5 h-5 rounded"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span>{testReport.consensus_client_info.name}</span>
            </div>
            <span>•</span>
            <Badge 
              variant={getStatusBadgeInfo(mainReport?.sync_status?.status || testReport.sync_info.status).variant}
              className="flex items-center gap-1"
            >
              {getStatusIcon(mainReport?.sync_status?.status || testReport.sync_info.status)}
              {getStatusBadgeInfo(mainReport?.sync_status?.status || testReport.sync_info.status).text}
            </Badge>
          </div>
        </div>
        <Link to="/tests">
          <Button variant="outline">Back to Tests</Button>
        </Link>
      </div>

      {/* Status Banner for Timeout/Error */}
      {(() => {
        const status = mainReport?.sync_status?.status || testReport.sync_info.status;
        const statusMessage = mainReport?.sync_status?.status_message || testReport.sync_info.status_message;
        
        if (status === 'timeout' || status === 'error') {
          return (
            <div className={`p-4 rounded-lg border-l-4 ${
              status === 'timeout' 
                ? 'bg-yellow-50 border-l-yellow-400 dark:bg-yellow-900/20 dark:border-l-yellow-400' 
                : 'bg-red-50 border-l-red-400 dark:bg-red-900/20 dark:border-l-red-400'
            }`}>
              <div className="flex items-start">
                <div className={`flex-shrink-0 ${
                  status === 'timeout' ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {status === 'timeout' ? (
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zM10 13a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="ml-3 flex-1">
                  <h3 className={`text-sm font-medium ${
                    status === 'timeout' 
                      ? 'text-yellow-800 dark:text-yellow-200' 
                      : 'text-red-800 dark:text-red-200'
                  }`}>
                    {status === 'timeout' ? 'Test Timed Out' : 'Test Failed'}
                  </h3>
                  {statusMessage && (
                    <p className={`mt-1 text-sm ${
                      status === 'timeout' 
                        ? 'text-yellow-700 dark:text-yellow-300' 
                        : 'text-red-700 dark:text-red-300'
                    }`}>
                      {statusMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

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
            <span className="text-2xl font-bold">{mainReport?.sync_status?.entries_count || testReport.sync_info.entries_count}</span>
            <span className="text-xs text-muted-foreground">Data points</span>
          </div>
        </Card>
      </div>

      {/* Client Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img 
                  src={`img/clients/${mainReport?.execution_client_info.type || testReport.execution_client_info.type}.jpg`} 
                  alt={`${mainReport?.execution_client_info.type || testReport.execution_client_info.type} logo`}
                  className="w-6 h-6 rounded"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <CardTitle className="capitalize">{mainReport?.execution_client_info.type || testReport.execution_client_info.type}</CardTitle>
              </div>
              {(() => {
                // Find EL log file if dump info is available
                const elLog = dumpInfo?.entries?.find(entry => 
                  !entry.is_directory && 
                  entry.name.includes(`el-`) && 
                  entry.name.includes(`-${testReport.execution_client_info.type}-`) && 
                  entry.name.endsWith('/output.log')
                );
                
                return elLog ? (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`#/dump/${testReport.run_id}?sourceUrl=${encodeURIComponent(testReport.source_url)}&network=${testReport.network}&elClient=${testReport.execution_client_info.type}&clClient=${testReport.consensus_client_info.type}&file=${encodeURIComponent(elLog.name)}&fullWindow=true&directory=${testReport.source_directory}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Logs
                    </a>
                  </Button>
                ) : null;
              })()}
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
              {mainReport?.execution_client_info.env_vars && Object.keys(mainReport.execution_client_info.env_vars).length > 0 && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowExecutionEnvVars(!showExecutionEnvVars)}
                    className="flex items-center gap-2 h-8 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ChevronIcon className={`h-4 w-4 transition-transform ${showExecutionEnvVars ? 'rotate-90' : ''}`} />
                    Environment Variables ({Object.keys(mainReport.execution_client_info.env_vars).length})
                  </Button>
                  {showExecutionEnvVars && (
                    <div className="pl-6">
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {Object.entries(mainReport.execution_client_info.env_vars)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([key, value]) => (
                            <div key={key} className="flex items-start gap-2 text-xs">
                              <div className="font-mono font-medium text-muted-foreground min-w-0 flex-shrink-0 w-32">
                                {key}:
                              </div>
                              <div className="font-mono bg-muted p-2 rounded-sm break-all min-w-0 flex-1">
                                {value}
                              </div>
                            </div>
                          ))}
                      </div>
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
              <div className="flex items-center gap-2">
                <img 
                  src={`img/clients/${mainReport?.consensus_client_info.type || testReport.consensus_client_info.type}.jpg`} 
                  alt={`${mainReport?.consensus_client_info.type || testReport.consensus_client_info.type} logo`}
                  className="w-6 h-6 rounded"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <CardTitle className="capitalize">{mainReport?.consensus_client_info.type || testReport.consensus_client_info.type}</CardTitle>
              </div>
              {(() => {
                // Find CL log file if dump info is available
                const clLog = dumpInfo?.entries?.find(entry => 
                  !entry.is_directory && 
                  entry.name.includes(`cl-`) && 
                  entry.name.includes(`-${testReport.consensus_client_info.type}-`) && 
                  entry.name.endsWith('/output.log')
                );
                
                return clLog ? (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`#/dump/${testReport.run_id}?sourceUrl=${encodeURIComponent(testReport.source_url)}&network=${testReport.network}&elClient=${testReport.execution_client_info.type}&clClient=${testReport.consensus_client_info.type}&file=${encodeURIComponent(clLog.name)}&fullWindow=true&directory=${testReport.source_directory}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Logs
                    </a>
                  </Button>
                ) : null;
              })()}
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
              {mainReport?.consensus_client_info.env_vars && Object.keys(mainReport.consensus_client_info.env_vars).length > 0 && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConsensusEnvVars(!showConsensusEnvVars)}
                    className="flex items-center gap-2 h-8 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ChevronIcon className={`h-4 w-4 transition-transform ${showConsensusEnvVars ? 'rotate-90' : ''}`} />
                    Environment Variables ({Object.keys(mainReport.consensus_client_info.env_vars).length})
                  </Button>
                  {showConsensusEnvVars && (
                    <div className="pl-6">
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {Object.entries(mainReport.consensus_client_info.env_vars)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([key, value]) => (
                            <div key={key} className="flex items-start gap-2 text-xs">
                              <div className="font-mono font-medium text-muted-foreground min-w-0 flex-shrink-0 w-32">
                                {key}:
                              </div>
                              <div className="font-mono bg-muted p-2 rounded-sm break-all min-w-0 flex-1">
                                {value}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Information */}
      {mainReport?.system_info && (
        <SystemInformation systemInfo={mainReport.system_info} />
      )}

      {/* GitHub Actions Information */}
      {mainReport?.labels && (
        <GithubActionsInfo labels={mainReport.labels} />
      )}

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
                <Badge variant="secondary">{testReport.source_display_name || testReport.source_directory}</Badge>
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
              {(mainReport?.sync_status?.status_message || testReport.sync_info.status_message) && (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Status Message</span>
                  <span className="text-sm break-words">
                    {mainReport?.sync_status?.status_message || testReport.sync_info.status_message}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Charts */}
      {progressLoading ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Progress Over Time</h2>
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
        </div>
      ) : progressError ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Progress Over Time</h2>
          <Card className="p-6">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">Unable to load progress data</p>
              <p className="text-sm">{progressError.message}</p>
            </div>
          </Card>
        </div>
      ) : (
        <ProgressCharts 
          progressData={progressData}
          title="Progress Over Time" 
          showTitle={true}
          compact={false}
        />
      )}

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
            {/* Dump File */}
            {dumpLoading ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Kurtosis Dump</span>
                <div className="animate-pulse bg-muted h-4 w-32 rounded"></div>
              </div>
            ) : dumpInfo && dumpInfo.exists ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-muted-foreground">Kurtosis Dump</span>
                    {dumpInfo.size && (
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(dumpInfo.size)} compressed
                      </span>
                    )}
                    {dumpInfo.entries && (
                      <span className="text-xs text-muted-foreground">
                        {dumpInfo.entries.filter(entry => !entry.is_directory).length} files
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`#/dump/${testReport.run_id}?sourceUrl=${encodeURIComponent(testReport.source_url)}&network=${testReport.network}&elClient=${testReport.execution_client_info.type}&clClient=${testReport.consensus_client_info.type}&directory=${testReport.source_directory}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Inspect
                      </a>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <a
                        href={`${testReport.source_url}${testReport.source_url.endsWith('/') ? '' : '/'}${testReport.run_id}-${testReport.network}_${testReport.execution_client_info.type}_${testReport.consensus_client_info.type}.main.dump.zip`}
                        download
                      >
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
                
                {/* Dump file details */}
                <div className="ml-4 space-y-2 text-sm text-muted-foreground">
                  {dumpInfo.entries && (
                    <>
                      
                      {(() => {
                        // Find EL and CL output.log files
                        const elLog = dumpInfo.entries.find(entry => 
                          !entry.is_directory && 
                          entry.name.includes(`el-`) && 
                          entry.name.includes(`-${testReport.execution_client_info.type}-`) && 
                          entry.name.endsWith('/output.log')
                        );
                        const clLog = dumpInfo.entries.find(entry => 
                          !entry.is_directory && 
                          entry.name.includes(`cl-`) && 
                          entry.name.includes(`-${testReport.consensus_client_info.type}-`) && 
                          entry.name.endsWith('/output.log')
                        );
                        
                        return (
                          <>
                            {elLog && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">EL</Badge>
                                  <span className="font-mono text-xs">
                                    {elLog.name.split('/').slice(-2, -1)[0]}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs">{formatBytes(elLog.size)}</span>
                                  <a
                                    href={`#/dump/${testReport.run_id}?sourceUrl=${encodeURIComponent(testReport.source_url)}&network=${testReport.network}&elClient=${testReport.execution_client_info.type}&clClient=${testReport.consensus_client_info.type}&file=${encodeURIComponent(elLog.name)}&fullWindow=true&directory=${testReport.source_directory}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                  >
                                    View logs
                                  </a>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => downloadLogFile(elLog.name, `${testReport.run_id}-el-output.log`)}
                                  >
                                    Download
                                  </Button>
                                </div>
                              </div>
                            )}
                            {clLog && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">CL</Badge>
                                  <span className="font-mono text-xs">
                                    {clLog.name.split('/').slice(-2, -1)[0]}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs">{formatBytes(clLog.size)}</span>
                                  <a
                                    href={`#/dump/${testReport.run_id}?sourceUrl=${encodeURIComponent(testReport.source_url)}&network=${testReport.network}&elClient=${testReport.execution_client_info.type}&clClient=${testReport.consensus_client_info.type}&file=${encodeURIComponent(clLog.name)}&fullWindow=true&directory=${testReport.source_directory}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                  >
                                    View logs
                                  </a>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => downloadLogFile(clLog.name, `${testReport.run_id}-cl-output.log`)}
                                  >
                                    Download
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            ) : dumpError ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Kurtosis Dump</span>
                <span className="text-sm text-muted-foreground">Not available</span>
              </div>
            ) : null}
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