import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { getDumpFileInfo } from '../lib/api';
import { ZipFileInfo, ZipFileEntry } from '../types/report';
import { formatBytes } from '../lib/utils';
import { FileViewer } from './FileViewer';
import { FileIcon, defaultStyles } from 'react-file-icon';

interface DumpFileViewerProps {
  sourceUrl: string;
  runId: string;
  network: string;
  elClient: string;
  clClient: string;
  onClose?: () => void;
  showExpandLink?: boolean;
  initialSelectedFile?: string;
  onFileSelect?: (filePath: string | null) => void;
  initialFullWindow?: boolean;
  onFullWindowToggle?: (fullWindow: boolean) => void;
}

export function DumpFileViewer({ sourceUrl, runId, network, elClient, clClient, onClose, showExpandLink = true, initialSelectedFile, onFileSelect, initialFullWindow, onFullWindowToggle }: DumpFileViewerProps) {
  const [zipInfo, setZipInfo] = useState<ZipFileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<ZipFileEntry | null>(null);
  const [elLogFile, setElLogFile] = useState<ZipFileEntry | null>(null);
  const [clLogFile, setClLogFile] = useState<ZipFileEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const fetchZipInfo = async () => {
      try {
        setLoading(true);
        setError(null);
        const info = await getDumpFileInfo(sourceUrl, runId, network, elClient, clClient);
        setZipInfo(info);
        
        if (!info.exists) {
          setError('Dump file not found');
        } else if (info.error) {
          setError(info.error);
        } else if (info.entries) {
          // Find EL and CL output.log files
          const elLog = info.entries.find(entry => 
            !entry.is_directory && 
            entry.name.includes(`el-`) && 
            entry.name.includes(`-${elClient}-`) && 
            entry.name.endsWith('/output.log')
          );
          const clLog = info.entries.find(entry => 
            !entry.is_directory && 
            entry.name.includes(`cl-`) && 
            entry.name.includes(`-${clClient}-`) && 
            entry.name.endsWith('/output.log')
          );
          
          setElLogFile(elLog || null);
          setClLogFile(clLog || null);
          
          // Set initial selected file if provided
          if (initialSelectedFile && info.entries) {
            const file = info.entries.find(entry => 
              !entry.is_directory && entry.name === initialSelectedFile
            );
            if (file) {
              setSelectedFile(file);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dump file info');
      } finally {
        setLoading(false);
      }
    };

    fetchZipInfo();
  }, [sourceUrl, runId, network, elClient, clClient, initialSelectedFile]);

  const handleFileSelect = (file: ZipFileEntry | null) => {
    setSelectedFile(file);
    if (onFileSelect) {
      onFileSelect(file ? file.name : null);
    }
  };

  // Filter files based on search query
  const filteredFiles = useMemo(() => {
    if (!zipInfo?.entries || !searchQuery) {
      return zipInfo?.entries?.filter(entry => !entry.is_directory) || [];
    }
    
    const query = searchQuery.toLowerCase();
    return zipInfo.entries.filter(entry => {
      if (entry.is_directory) return false;
      
      // Search in file name and path
      const fileName = entry.name.toLowerCase();
      const fileNameOnly = entry.name.split('/').pop()?.toLowerCase() || '';
      
      // Check if query matches file name, path, or extension
      return fileName.includes(query) || 
             fileNameOnly.includes(query) ||
             fileName.split('.').pop()?.includes(query);
    });
  }, [zipInfo?.entries, searchQuery]);

  const getFileIconComponent = (fileName: string, isDirectory: boolean) => {
    if (isDirectory) {
      return <span className="text-lg">📁</span>;
    }
    
    const name = fileName.split('/').pop()?.toLowerCase() || '';
    let ext = fileName.split('.').pop()?.toLowerCase();
    
    // Handle special cases and map to extensions that react-file-icon supports
    if (name === 'dockerfile') ext = 'docker';
    if (name === 'makefile') ext = 'make';
    if (name === 'readme' || name === 'readme.md') ext = 'md';
    if (name === 'jwtsecret') ext = 'key';
    
    // Map some extensions to more common ones that react-file-icon supports
    switch (ext) {
      case 'yml':
        ext = 'yaml';
        break;
      case 'text':
        ext = 'txt';
        break;
      case 'sh':
      case 'bash':
        ext = 'sh';
        break;
      case 'cc':
      case 'cpp':
        ext = 'cpp';
        break;
      case 'jpeg':
        ext = 'jpg';
        break;
      case 'conf':
      case 'config':
      case 'ini':
        ext = 'config';
        break;
      case 'sqlite':
        ext = 'db';
        break;
      case 'pem':
      case 'crt':
      case 'cert':
        ext = 'key';
        break;
      case '7z':
      case 'tar':
      case 'gz':
        ext = 'zip';
        break;
    }
    
    // Get default styles as base
    const baseIconProps = defaultStyles[ext as keyof typeof defaultStyles] || defaultStyles.txt;
    
    // Define custom colors for different file types
    let customProps = { ...baseIconProps };
    
    switch (ext) {
      // Programming languages
      case 'js':
      case 'jsx':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#f7df1e',      // JavaScript yellow
          gradientColor: '#f0db4f',   // Lighter JS yellow
          labelColor: '#323330'       // Dark gray for contrast
        };
        break;
      case 'ts':
      case 'tsx':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#3178c6',      // TypeScript blue
          gradientColor: '#235a97',   // Darker TS blue
          labelColor: '#ffffff'       // White for contrast
        };
        break;
      case 'py':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#3776ab',      // Python blue
          gradientColor: '#ffd43b',   // Python yellow
          labelColor: '#646464'       // Gray
        };
        break;
      case 'go':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#00add8',      // Go cyan
          gradientColor: '#007d9c',   // Darker Go blue
          labelColor: '#ffffff'       // White
        };
        break;
      case 'rs':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#ce422b',      // Rust red
          gradientColor: '#000000',   // Black
          labelColor: '#ffffff'       // White
        };
        break;
      case 'java':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#f89820',      // Java orange
          gradientColor: '#5382a1',   // Java blue
          labelColor: '#ffffff'       // White
        };
        break;
      case 'cpp':
      case 'c':
      case 'h':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#00599c',      // C++ blue
          gradientColor: '#004482',   // Darker C++ blue
          labelColor: '#ffffff'       // White
        };
        break;
      case 'rb':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#cc342d',      // Ruby red
          gradientColor: '#a91401',   // Darker ruby red
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Web files
      case 'html':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#e34c26',      // HTML orange
          gradientColor: '#f16529',   // Lighter HTML orange
          labelColor: '#ffffff'       // White
        };
        break;
      case 'css':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#1572b6',      // CSS blue
          gradientColor: '#33a9dc',   // Lighter CSS blue
          labelColor: '#ffffff'       // White
        };
        break;
      case 'scss':
      case 'sass':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#cc6699',      // Sass pink
          gradientColor: '#bf4080',   // Darker Sass pink
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Data files
      case 'json':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#90a959',      // JSON green
          gradientColor: '#cbcb41',   // JSON yellow-green
          labelColor: '#3d3d3d'       // Dark gray
        };
        break;
      case 'yaml':
      case 'yml':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#cb171e',      // YAML red
          gradientColor: '#ff6b6b',   // Lighter red
          labelColor: '#ffffff'       // White
        };
        break;
      case 'toml':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#9c4221',      // TOML brown
          gradientColor: '#e37933',   // TOML orange
          labelColor: '#ffffff'       // White
        };
        break;
      case 'xml':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#f97316',      // XML orange
          gradientColor: '#ff9800',   // Lighter orange
          labelColor: '#ffffff'       // White
        };
        break;
      case 'csv':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#22c55e',      // CSV green
          gradientColor: '#16a34a',   // Darker green
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Config files
      case 'env':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#ecd53f',      // ENV yellow
          gradientColor: '#f4e55d',   // Lighter yellow
          labelColor: '#3d3d3d'       // Dark gray
        };
        break;
      case 'config':
      case 'ini':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#6b7280',      // Config gray
          gradientColor: '#9ca3af',   // Lighter gray
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Shell scripts
      case 'sh':
      case 'bash':
      case 'zsh':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#4eaa25',      // Shell green
          gradientColor: '#89e051',   // Lighter green
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Docker
      case 'docker':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#2496ed',      // Docker blue
          gradientColor: '#0db7ed',   // Docker cyan
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Documentation
      case 'md':
      case 'markdown':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#083fa1',      // Markdown blue
          gradientColor: '#0e7fc1',   // Lighter blue
          labelColor: '#ffffff'       // White
        };
        break;
      case 'txt':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#6b7280',      // Text gray
          gradientColor: '#a8a8a8',   // Lighter gray
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Logs
      case 'log':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#f59e0b',      // Log amber
          gradientColor: '#fbbf24',   // Lighter amber
          labelColor: '#7c2d12'       // Dark amber
        };
        break;
      
      // Archives
      case 'zip':
      case 'tar':
      case 'gz':
      case '7z':
      case 'rar':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#a855f7',      // Archive purple
          gradientColor: '#c084fc',   // Lighter purple
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Images
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
      case 'webp':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#06b6d4',      // Image cyan
          gradientColor: '#22d3ee',   // Lighter cyan
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Certificates/Keys
      case 'key':
      case 'pem':
      case 'crt':
      case 'cert':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#ef4444',      // Security red
          gradientColor: '#dc2626',   // Darker red
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Database
      case 'db':
      case 'sqlite':
      case 'sql':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#336791',      // Database blue
          gradientColor: '#4e8bbf',   // Lighter database blue
          labelColor: '#ffffff'       // White
        };
        break;
      
      // Build files
      case 'make':
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#427819',      // Make green
          gradientColor: '#6dad2a',   // Lighter green
          labelColor: '#ffffff'       // White
        };
        break;
      
      default:
        customProps = { 
          ...baseIconProps, 
          glyphColor: '#9ca3af',      // Default gray
          gradientColor: '#d1d5db',   // Lighter gray
          labelColor: '#374151'       // Dark gray
        };
        break;
    }
    
    return (
      <FileIcon
        extension={ext || 'txt'}
        {...customProps}
      />
    );
  };

  const renderFileEntry = (entry: ZipFileEntry, index: number) => {
    const isFolder = entry.is_directory;
    const iconComponent = getFileIconComponent(entry.name, isFolder);
    
    return (
      <div 
        key={index} 
        className={`flex items-center justify-between py-2 px-3 border-b last:border-b-0 hover:bg-muted/50 ${!isFolder ? 'cursor-pointer' : ''}`}
        onClick={() => !isFolder && handleFileSelect(entry)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center justify-center" style={{ width: '16px', height: '16px' }}>
            {iconComponent}
          </div>
          <span className="font-mono text-sm truncate" title={entry.name}>
            {entry.name}
          </span>
          {isFolder && <Badge variant="outline" className="text-xs">folder</Badge>}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {!isFolder && (
            <span>{formatBytes(entry.size)}</span>
          )}
          <span>{new Date(entry.modified).toLocaleDateString()}</span>
        </div>
      </div>
    );
  };

  const downloadUrl = `${sourceUrl}${sourceUrl.endsWith('/') ? '' : '/'}${runId}-${network}_${elClient}_${clClient}.main.dump.zip`;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Dump File</span>
            {onClose && <Button variant="ghost" size="sm" onClick={onClose}>×</Button>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !zipInfo || !zipInfo.exists) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Dump File</span>
            {onClose && <Button variant="ghost" size="sm" onClick={onClose}>×</Button>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <p>{error || 'Dump file not available'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Left Sidebar - Quick Access and File List */}
      <div className="w-1/3 min-w-80 flex flex-col space-y-4 overflow-hidden">
        {/* Quick Access Logs Section */}
        {(elLogFile || clLogFile) && (
          <Card className="flex-shrink-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span>📋</span>
                <span>Quick Access</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {elLogFile && (
                  <div
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleFileSelect(elLogFile)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex items-center justify-center" style={{ width: '16px', height: '16px' }}>
                        {getFileIconComponent(elLogFile.name, false)}
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">EL</Badge>
                      <span className="font-mono text-sm truncate">
                        output.log
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatBytes(elLogFile.size)}
                    </span>
                  </div>
                )}
                {clLogFile && (
                  <div
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleFileSelect(clLogFile)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex items-center justify-center" style={{ width: '16px', height: '16px' }}>
                        {getFileIconComponent(clLogFile.name, false)}
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">CL</Badge>
                      <span className="font-mono text-sm truncate">
                        output.log
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatBytes(clLogFile.size)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* File Browser */}
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader className="pb-3 flex-shrink-0">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2 min-w-0">
                <span>Files</span>
                <Badge variant="secondary" className="text-xs">
                  {zipInfo.entries?.filter(entry => !entry.is_directory).length || 0}
                </Badge>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {showExpandLink && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/dump/${runId}?sourceUrl=${encodeURIComponent(sourceUrl)}&network=${network}&elClient=${elClient}&clClient=${clClient}`}>
                      Expand
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm">
                  <a href={downloadUrl} download>
                    Download
                  </a>
                </Button>
                {onClose && <Button variant="ghost" size="sm" onClick={onClose}>×</Button>}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0">
            {/* Search input */}
            <div className="mb-3 flex-shrink-0">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                  <path d="M10 10L13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <Input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-10 text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* File listing */}
            {zipInfo.entries && zipInfo.entries.length > 0 && (
              <div className="border rounded-lg flex-1 min-h-0 max-h-[calc(100vh-40rem)] overflow-y-auto">
                {filteredFiles.length > 0 ? (
                  filteredFiles.map((entry, index) => renderFileEntry(entry, index))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchQuery ? (
                      <>
                        <p className="font-medium">No files found</p>
                        <p className="text-sm mt-1">Try a different search term</p>
                      </>
                    ) : (
                      <p>No files in this dump</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {zipInfo.error && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex-shrink-0">
                {zipInfo.error}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Content Area - File Viewer */}
      <div className="flex-1 min-w-0">
        {selectedFile ? (
          <Card className="h-full">
            <FileViewer
              sourceUrl={sourceUrl}
              runId={runId}
              network={network}
              elClient={elClient}
              clClient={clClient}
              filePath={selectedFile.name}
              fileSize={selectedFile.size}
              onClose={() => handleFileSelect(null)}
              initialFullWindow={initialFullWindow}
              onFullWindowToggle={onFullWindowToggle}
            />
          </Card>
        ) : (
          <Card className="h-full flex items-center justify-center">
            <CardContent>
              <div className="text-center text-muted-foreground">
                <div className="mb-4">
                  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium mb-2">No file selected</h3>
                <p className="text-sm">
                  Select a file from the list on the left to view its contents
                </p>
                {(elLogFile || clLogFile) && (
                  <p className="text-sm mt-2">
                    Try the Quick Access section for common log files
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default DumpFileViewer;