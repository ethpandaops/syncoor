import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { useConfig } from '../../hooks/useConfig';
import { clsx } from 'clsx';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const { data: config, isLoading, error, refetch } = useConfig();
  const [enabledDirectories, setEnabledDirectories] = useState<Set<string>>(new Set());

  const toggleDirectory = (directoryName: string) => {
    const newEnabled = new Set(enabledDirectories);
    if (newEnabled.has(directoryName)) {
      newEnabled.delete(directoryName);
    } else {
      newEnabled.add(directoryName);
    }
    setEnabledDirectories(newEnabled);
  };

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <aside className={clsx(
        "border-r bg-background transition-all duration-300",
        isCollapsed ? "w-16" : "w-80"
      )}>
        <div className="p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded-sm" />
            <div className="h-4 bg-muted rounded-sm" />
            <div className="h-4 bg-muted rounded-sm" />
          </div>
        </div>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className={clsx(
        "border-r bg-background transition-all duration-300",
        isCollapsed ? "w-16" : "w-80"
      )}>
        <div className="p-4">
          <div className="text-destructive text-sm">
            Error loading configuration: {error.message}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className={clsx(
      "border-r bg-background transition-all duration-300",
      isCollapsed ? "w-16" : "w-80"
    )}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          {!isCollapsed && (
            <h2 className="text-lg font-semibold">Directories</h2>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRightIcon className="h-4 w-4" />
            ) : (
              <ChevronLeftIcon className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!isCollapsed && (
            <div className="space-y-4">
              {/* Refresh button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="w-full"
                disabled={isLoading}
              >
                <RefreshIcon className="mr-2 h-4 w-4" />
                Refresh
              </Button>

              {/* Directory list */}
              {config?.directories.map((directory) => (
                <Card key={directory.name} className="p-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="truncate">{directory.displayName || directory.name}</span>
                        <StatusIndicator 
                          status={directory.enabled ? "online" : "offline"}
                        />
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Enable
                        </span>
                        <Switch
                          checked={enabledDirectories.has(directory.name)}
                          onCheckedChange={() => toggleDirectory(directory.name)}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {directory.url}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// Status indicator component
function StatusIndicator({ status }: { status: 'online' | 'offline' }) {
  return (
    <div className="flex items-center space-x-1">
      <div
        className={clsx(
          "h-2 w-2 rounded-full",
          status === 'online' ? "bg-green-500" : "bg-red-500"
        )}
      />
      <Badge
        variant={status === 'online' ? "success" : "destructive"}
        className="text-xs"
      >
        {status}
      </Badge>
    </div>
  );
}

// SVG Icons
function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
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

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M1 4v6h6M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  );
}