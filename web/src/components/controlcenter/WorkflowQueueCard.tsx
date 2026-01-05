import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { WorkflowQueueStatus } from '../../types/controlCenter';

interface WorkflowQueueCardProps {
  workflow: WorkflowQueueStatus;
}

const WorkflowQueueCard: React.FC<WorkflowQueueCardProps> = ({ workflow }) => {
  const formatTimeAgo = (timestamp: string): string => {
    if (!timestamp) return 'Never';
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes === 1) return '1 minute ago';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };

  const hasError = !!workflow.error;
  const totalJobs = workflow.queued_count + workflow.running_count;

  return (
    <Card className={`hover:shadow-md transition-shadow ${hasError ? 'border-red-300 dark:border-red-700' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitHubIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{workflow.name}</h3>
          </div>
          {totalJobs > 0 && (
            <Badge variant="outline" className="text-xs">
              {totalJobs} job{totalJobs !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Queued:</span>
            <span className={`font-medium ${workflow.queued_count > 0 ? 'text-yellow-600 dark:text-yellow-400' : ''}`}>
              {workflow.queued_count}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Running:</span>
            <span className={`font-medium ${workflow.running_count > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>
              {workflow.running_count}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Check:</span>
            <span>{formatTimeAgo(workflow.last_check)}</span>
          </div>
        </div>

        {hasError && (
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400 truncate">
            {workflow.error}
          </div>
        )}

        <div className="mt-3 pt-3 border-t">
          <a
            href={workflow.workflow_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline flex items-center gap-1"
          >
            <ExternalLinkIcon className="h-3 w-3" />
            View on GitHub
          </a>
        </div>
      </CardContent>
    </Card>
  );
};

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

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

export default WorkflowQueueCard;
