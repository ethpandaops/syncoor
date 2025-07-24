import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { formatBytes } from '../lib/utils';
import { SystemInfo } from '../hooks/useMainReport';

interface SystemInformationProps {
  systemInfo: SystemInfo;
}

export function SystemInformation({ systemInfo }: SystemInformationProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSystemInfo, setShowSystemInfo] = useState(() => {
    return searchParams.get('systemInfo') === 'true';
  });

  // Update URL when system info state changes
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    if (showSystemInfo) {
      newParams.set('systemInfo', 'true');
    } else {
      newParams.delete('systemInfo');
    }
    setSearchParams(newParams, { replace: true });
  }, [showSystemInfo, searchParams, setSearchParams]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>System Information</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSystemInfo(!showSystemInfo)}
            className="flex items-center gap-2 h-8 px-2 text-sm font-medium"
          >
            <ChevronIcon className={`h-4 w-4 transition-transform ${showSystemInfo ? 'rotate-90' : ''}`} />
            {showSystemInfo ? 'Hide' : 'Show'} Details
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!showSystemInfo && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 py-2">
            <div>
              <span className="text-sm font-medium text-muted-foreground">Operating System</span>
              <div className="text-sm mt-1">
                {[
                  systemInfo.os_name,
                  systemInfo.os_vendor,
                  systemInfo.os_version || systemInfo.platform_version
                ].filter(Boolean).join(' ') || 'Unknown'}
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-muted-foreground">CPU</span>
              <div className="text-sm mt-1">
                {(() => {
                  const parts = [];
                  
                  // Add cores/threads info
                  if (systemInfo.cpu_cores && systemInfo.cpu_cores > 0) {
                    if (systemInfo.cpu_threads && systemInfo.cpu_threads > 0) {
                      parts.push(`${systemInfo.cpu_cores}/${systemInfo.cpu_threads} cores`);
                    } else {
                      parts.push(`${systemInfo.cpu_cores} cores`);
                    }
                  } else if (systemInfo.cpu_threads && systemInfo.cpu_threads > 0) {
                    parts.push(`${systemInfo.cpu_threads} threads`);
                  }
                  
                  // Add speed info
                  if (systemInfo.cpu_speed && systemInfo.cpu_speed > 0) {
                    parts.push(`${systemInfo.cpu_speed} MHz`);
                  }
                  
                  return parts.length > 0 ? parts.join(', ') : 'N/A';
                })()}
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-muted-foreground">Memory</span>
              <div className="text-sm mt-1">{formatBytes(systemInfo.total_memory)}</div>
            </div>
            {systemInfo.syncoor_version && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Syncoor Version</span>
                <div className="text-sm font-mono mt-1">{systemInfo.syncoor_version}</div>
              </div>
            )}
          </div>
        )}
        {showSystemInfo && (
        <div className="space-y-6">
          {/* Basic System Info */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Basic Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <span className="text-sm font-medium text-muted-foreground">Hostname</span>
                <div className="text-sm font-medium mt-1">{systemInfo.hostname}</div>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Go Version</span>
                <div className="text-sm font-mono mt-1">{systemInfo.go_version}</div>
              </div>
              {systemInfo.syncoor_version && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Syncoor Version</span>
                  <div className="text-sm font-mono mt-1">{systemInfo.syncoor_version}</div>
                </div>
              )}
            </div>
          </div>

          {/* Operating System Information */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Operating System</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {systemInfo.os_name && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">OS Name</span>
                  <div className="text-sm mt-1">{systemInfo.os_name}</div>
                </div>
              )}
              {systemInfo.os_vendor && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">OS Vendor</span>
                  <div className="text-sm mt-1">{systemInfo.os_vendor}</div>
                </div>
              )}
              {systemInfo.os_version && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">OS Version</span>
                  <div className="text-sm mt-1">{systemInfo.os_version}</div>
                </div>
              )}
              {systemInfo.os_release && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">OS Release</span>
                  <div className="text-sm mt-1">{systemInfo.os_release}</div>
                </div>
              )}
              {systemInfo.os_architecture && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Architecture</span>
                  <div className="text-sm mt-1">{systemInfo.os_architecture}</div>
                </div>
              )}
              {systemInfo.kernel_version && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Kernel Version</span>
                  <div className="text-sm font-mono mt-1">{systemInfo.kernel_version}</div>
                </div>
              )}
              {systemInfo.kernel_release && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Kernel Release</span>
                  <div className="text-sm font-mono mt-1">{systemInfo.kernel_release}</div>
                </div>
              )}
            </div>
          </div>

          {/* CPU Information */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">CPU Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {systemInfo.cpu_vendor && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">CPU Vendor</span>
                  <div className="text-sm mt-1">{systemInfo.cpu_vendor}</div>
                </div>
              )}
              {systemInfo.cpu_model && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">CPU Model</span>
                  <div className="text-sm font-mono mt-1 break-all">{systemInfo.cpu_model}</div>
                </div>
              )}
              {systemInfo.cpu_speed && systemInfo.cpu_speed > 0 && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">CPU Speed</span>
                  <div className="text-sm mt-1">{systemInfo.cpu_speed} MHz</div>
                </div>
              )}
              {systemInfo.cpu_cache && systemInfo.cpu_cache > 0 && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">CPU Cache</span>
                  <div className="text-sm mt-1">{formatBytes(systemInfo.cpu_cache * 1024)}</div>
                </div>
              )}
              {systemInfo.cpu_cores && systemInfo.cpu_cores > 0 && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Physical Cores</span>
                  <div className="text-sm mt-1">{systemInfo.cpu_cores}</div>
                </div>
              )}
              {systemInfo.cpu_threads && systemInfo.cpu_threads > 0 && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Logical Cores</span>
                  <div className="text-sm mt-1">{systemInfo.cpu_threads}</div>
                </div>
              )}
            </div>
          </div>

          {/* Memory Information */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Memory Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <span className="text-sm font-medium text-muted-foreground">Total Memory</span>
                <div className="text-sm mt-1">{formatBytes(systemInfo.total_memory)}</div>
              </div>
              {systemInfo.memory_type && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Memory Type</span>
                  <div className="text-sm mt-1">{systemInfo.memory_type}</div>
                </div>
              )}
              {systemInfo.memory_speed && systemInfo.memory_speed > 0 && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Memory Speed</span>
                  <div className="text-sm mt-1">{systemInfo.memory_speed} MT/s</div>
                </div>
              )}
            </div>
          </div>

          {/* Hardware Information */}
          {(systemInfo.hypervisor || systemInfo.timezone || systemInfo.product_name || systemInfo.product_vendor || systemInfo.board_name || systemInfo.board_vendor) && (
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Hardware Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {systemInfo.hypervisor && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Hypervisor</span>
                    <div className="text-sm mt-1">{systemInfo.hypervisor}</div>
                  </div>
                )}
                {systemInfo.timezone && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Timezone</span>
                    <div className="text-sm mt-1">{systemInfo.timezone}</div>
                  </div>
                )}
                {systemInfo.product_name && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Product Name</span>
                    <div className="text-sm mt-1">{systemInfo.product_name}</div>
                  </div>
                )}
                {systemInfo.product_vendor && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Product Vendor</span>
                    <div className="text-sm mt-1">{systemInfo.product_vendor}</div>
                  </div>
                )}
                {systemInfo.board_name && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Board Name</span>
                    <div className="text-sm mt-1">{systemInfo.board_name}</div>
                  </div>
                )}
                {systemInfo.board_vendor && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Board Vendor</span>
                    <div className="text-sm mt-1">{systemInfo.board_vendor}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </CardContent>
    </Card>
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