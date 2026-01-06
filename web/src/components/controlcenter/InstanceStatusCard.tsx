import React from 'react';
import { Card } from '../ui/card';
import { InstanceHealth, DirectoryInfo, RecentRun } from '../../types/controlCenter';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

interface InstanceStatusCardProps {
  instance: InstanceHealth;
}

const InstanceStatusCard: React.FC<InstanceStatusCardProps> = ({ instance }) => {
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'unhealthy':
        return 'bg-red-500';
      default:
        return 'bg-yellow-500';
    }
  };

  const formatTimeAgo = (timestamp: string): string => {
    if (!timestamp) return 'Never';
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes === 1) return '1m ago';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const formatUnixTimeAgo = (timestamp: number): string => {
    if (!timestamp) return 'Unknown';
    const now = Date.now();
    const diffMs = now - (timestamp * 1000);
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes === 1) return '1m ago';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
        <div className="flex items-center gap-3">
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`w-3 h-3 rounded-full ${getStatusColor(instance.status)} cursor-default`} />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs capitalize">
                {instance.status}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <h3 className="font-semibold">{instance.name}</h3>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            Active: <span className={instance.active_tests > 0 ? 'text-green-600 dark:text-green-400 font-medium' : ''}>{instance.active_tests}</span>
          </span>
          <span className="text-muted-foreground/50">|</span>
          <span title={instance.last_check ? new Date(instance.last_check).toLocaleString() : ''}>
            Last Check: {formatTimeAgo(instance.last_check)}
          </span>
          {instance.ui_url && (
            <>
              <span className="text-muted-foreground/50">|</span>
              <a
                href={instance.ui_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline flex items-center gap-1"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" />
                Dashboard
              </a>
            </>
          )}
        </div>
      </div>

      {/* Error message */}
      {instance.error_message && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 border-b">
          {instance.error_message}
        </div>
      )}

      {/* Directories - filter out ones with fetch errors (e.g., 404) */}
      {(() => {
        const validDirectories = instance.directories?.filter(dir => !dir.fetch_error) || [];
        return validDirectories.length > 0 ? (
          <div className="divide-y">
            {validDirectories.map((dir) => (
              <DirectoryRow
                key={dir.name}
                directory={dir}
                instanceUiUrl={instance.ui_url}
                formatUnixTimeAgo={formatUnixTimeAgo}
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            No directories configured
          </div>
        );
      })()}
    </Card>
  );
};

interface DirectoryRowProps {
  directory: DirectoryInfo;
  instanceUiUrl?: string;
  formatUnixTimeAgo: (ts: number) => string;
}

const DirectoryRow: React.FC<DirectoryRowProps> = ({ directory, instanceUiUrl, formatUnixTimeAgo }) => {
  const displayName = directory.display_name || directory.name;
  const directoryUiUrl = instanceUiUrl
    ? `${instanceUiUrl}#/?directory=${encodeURIComponent(directory.name)}`
    : undefined;

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2">
        {directoryUiUrl ? (
          <a
            href={directoryUiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
          >
            {displayName}
          </a>
        ) : (
          <span className="font-medium">{displayName}</span>
        )}
        <span className="text-muted-foreground text-sm">({directory.total_tests} tests)</span>
      </div>

      {/* Recent runs badges */}
      {directory.recent_runs && directory.recent_runs.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Recent:</span>
          {directory.recent_runs.map((run, i) => (
            <RecentRunBadge key={i} run={run} formatUnixTimeAgo={formatUnixTimeAgo} />
          ))}
        </div>
      )}
    </div>
  );
};

interface RecentRunBadgeProps {
  run: RecentRun;
  formatUnixTimeAgo: (ts: number) => string;
}

const RecentRunBadge: React.FC<RecentRunBadgeProps> = ({ run, formatUnixTimeAgo }) => {
  const getStatusBorderColor = (status: string): string => {
    switch (status) {
      case 'success':
        return 'border-green-500';
      case 'timeout':
        return 'border-yellow-500';
      case 'failed':
        return 'border-red-500';
      default:
        return 'border-gray-400';
    }
  };

  const getStatusBgColor = (status: string): string => {
    switch (status) {
      case 'success':
        return 'bg-green-500/10';
      case 'timeout':
        return 'bg-yellow-500/10';
      case 'failed':
        return 'bg-red-500/10';
      default:
        return 'bg-gray-500/10';
    }
  };

  const getClientLogo = (clientName: string): string => {
    return `img/clients/${clientName.toLowerCase()}.jpg`;
  };

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-md border-2 ${getStatusBorderColor(run.status)} ${getStatusBgColor(run.status)} cursor-default hover:shadow-sm transition-all`}
          >
            {/* Client logos */}
            <div className="flex items-center gap-1">
              <img
                src={getClientLogo(run.el_client)}
                alt={run.el_client}
                className="w-4 h-4 rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <span className="text-muted-foreground text-xs">+</span>
              <img
                src={getClientLogo(run.cl_client)}
                alt={run.cl_client}
                className="w-4 h-4 rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            {/* Time ago */}
            <span className="text-[10px] text-muted-foreground leading-none">
              {formatUnixTimeAgo(run.time)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {run.el_client}/{run.cl_client} • {run.status}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default InstanceStatusCard;
