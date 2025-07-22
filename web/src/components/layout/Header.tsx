import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../ui/button';
import { useTheme } from '../../contexts/theme';
import { useConfig } from '../../hooks/useConfig';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';

const navigationItems = [
  { name: 'Dashboard', href: '/' },
  { name: 'Tests', href: '/tests' },
];

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const { data: config, isLoading, error, refetch } = useConfig();
  const [showDirectories, setShowDirectories] = useState(false);
  const [enabledDirectories, setEnabledDirectories] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDirectories(false);
      }
    }

    if (showDirectories) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDirectories]);

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

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center">
        {/* Logo and Title */}
        <div className="mr-8">
          <Link to="/" className="flex items-center space-x-2">
            <img 
              src="./img/logo.png" 
              alt="Syncoor Logo" 
              className="h-10 w-10"
            />
            <span className="text-lg font-bold">Syncoor</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex items-center space-x-1">
          {navigationItems.map((item) => (
            <Button
              key={item.name}
              variant={location.pathname === item.href ? "default" : "ghost"}
              size="sm"
              asChild
            >
              <Link to={item.href}>
                {item.name}
              </Link>
            </Button>
          ))}
        </nav>

        {/* Right side - Settings and Theme toggle */}
        <div className="ml-auto flex items-center space-x-2 relative" ref={dropdownRef}>
          {/* Settings/Directories button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDirectories(!showDirectories)}
            className="h-9 w-9"
            aria-label="Toggle directories"
          >
            <CogIcon className="h-4 w-4" />
          </Button>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <MoonIcon className="h-4 w-4" />
            ) : (
              <SunIcon className="h-4 w-4" />
            )}
          </Button>

          {/* Directories dropdown */}
          {showDirectories && (
            <div className="absolute top-12 right-0 w-80 bg-background border rounded-lg shadow-lg z-50">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Directories</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isLoading}
                  >
                    <RefreshIcon className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto p-4">
                {isLoading ? (
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-muted rounded-sm" />
                    <div className="h-4 bg-muted rounded-sm" />
                    <div className="h-4 bg-muted rounded-sm" />
                  </div>
                ) : error ? (
                  <div className="text-destructive text-sm">
                    Error loading configuration: {error.message}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {config?.directories.map((directory) => (
                      <Card key={directory.name} className="p-0">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">
                            <div className="flex items-center justify-between">
                              <span className="truncate">{directory.name}</span>
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
          )}
        </div>
      </div>
    </header>
  );
}

// Status indicator component
function StatusIndicator({ status }: { status: 'online' | 'offline' }) {
  return (
    <div className="flex items-center space-x-1">
      <div
        className={`h-2 w-2 rounded-full ${
          status === 'online' ? "bg-green-500" : "bg-red-500"
        }`}
      />
      <Badge
        variant={status === 'online' ? "default" : "destructive"}
        className="text-xs"
      >
        {status}
      </Badge>
    </div>
  );
}

// SVG Icons
function CogIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx={12} cy={12} r={5} />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
