import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { InstanceHealth } from '../../types/controlCenter';

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

  const getStatusVariant = (status: string): 'default' | 'destructive' | 'outline' | 'success' => {
    switch (status) {
      case 'healthy':
        return 'success';
      case 'unhealthy':
        return 'destructive';
      default:
        return 'outline';
    }
  };

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

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor(instance.status)}`} />
            <h3 className="font-semibold text-sm">{instance.name}</h3>
          </div>
          <Badge variant={getStatusVariant(instance.status)} className="text-xs capitalize">
            {instance.status}
          </Badge>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Active Tests:</span>
            <span className="font-medium text-green-600 dark:text-green-400">
              {instance.active_tests}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Tests:</span>
            <span className="font-medium">{instance.total_tests}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Check:</span>
            <span>{formatTimeAgo(instance.last_check)}</span>
          </div>
        </div>

        {instance.error_message && (
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400">
            {instance.error_message}
          </div>
        )}

        {instance.ui_url && (
          <div className="mt-3 pt-3 border-t">
            <a
              href={instance.ui_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline flex items-center gap-1"
            >
              <ExternalLinkIcon className="h-3 w-3" />
              View Dashboard
            </a>
          </div>
        )}
      </CardContent>
    </Card>
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
