import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { getDumpFileInfo } from '../lib/api';
import { ZipFileInfo, ZipFileEntry } from '../types/report';
import { formatBytes } from '../lib/utils';
import { FileViewer } from './FileViewer';

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

  const renderFileEntry = (entry: ZipFileEntry, index: number) => {
    const isFolder = entry.is_directory;
    const icon = isFolder ? '📁' : '📄';
    
    return (
      <div 
        key={index} 
        className={`flex items-center justify-between py-2 px-3 border-b last:border-b-0 hover:bg-muted/50 ${!isFolder ? 'cursor-pointer' : ''}`}
        onClick={() => !isFolder && handleFileSelect(entry)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg">{icon}</span>
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
    <div className="space-y-4">
      {/* Quick Access Logs Section */}
      {(elLogFile || clLogFile) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>📋</span>
              <span>Quick Access Logs</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {elLogFile && (
                <div 
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleFileSelect(elLogFile)}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">EL</Badge>
                    <span className="font-mono text-sm">
                      {elLogFile.name.split('/').slice(-2).join('/')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({formatBytes(elLogFile.size)})
                    </span>
                  </div>
                  <Button size="sm" variant="ghost">
                    View Log
                  </Button>
                </div>
              )}
              {clLogFile && (
                <div 
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleFileSelect(clLogFile)}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">CL</Badge>
                    <span className="font-mono text-sm">
                      {clLogFile.name.split('/').slice(-2).join('/')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({formatBytes(clLogFile.size)})
                    </span>
                  </div>
                  <Button size="sm" variant="ghost">
                    View Log
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Dump File Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Kurtosis Enclave Dump</span>
              <Badge variant="secondary">{runId}-{network}_{elClient}_{clClient}.main.dump.zip</Badge>
            </div>
            {onClose && <Button variant="ghost" size="sm" onClick={onClose}>×</Button>}
          </CardTitle>
        </CardHeader>
        <CardContent>
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {zipInfo.size && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Size: </span>
                  <span className="text-sm">{formatBytes(zipInfo.size)}</span>
                </div>
              )}
              {zipInfo.entries && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Files: </span>
                  <span className="text-sm">{zipInfo.entries.filter(entry => !entry.is_directory).length}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {showExpandLink && (
                <Button asChild variant="outline" size="sm">
                  <Link to={`/dump/${runId}?sourceUrl=${encodeURIComponent(sourceUrl)}&network=${network}&elClient=${elClient}&clClient=${clClient}`}>
                    Explore
                  </Link>
                </Button>
              )}
              <Button asChild size="sm">
                <a href={downloadUrl} download>
                  Download ZIP
                </a>
              </Button>
            </div>
          </div>

          {/* File listing */}
          {zipInfo.entries && zipInfo.entries.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">
                Contents: 
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  (click files to view)
                </span>
              </h4>
              <div className="border rounded-lg max-h-96 overflow-y-auto">
                {zipInfo.entries.filter(entry => !entry.is_directory).map((entry, index) => renderFileEntry(entry, index))}
              </div>
              {zipInfo.error && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  {zipInfo.error}
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    {/* File viewer */}
    {selectedFile && (
      <Card>
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
    )}
  </div>
  );
}

export default DumpFileViewer;