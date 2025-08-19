import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { extractFileFromDump } from '../lib/api';
import { formatBytes } from '../lib/utils';

interface FileViewerProps {
  sourceUrl: string;
  runId: string;
  network: string;
  elClient: string;
  clClient: string;
  filePath: string;
  fileSize?: number;
  onClose?: () => void;
}

export function FileViewer({ 
  sourceUrl, 
  runId, 
  network, 
  elClient, 
  clClient, 
  filePath, 
  fileSize,
  onClose 
}: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedSize, setLoadedSize] = useState<number | null>(null);
  const currentRequestRef = useRef<string | null>(null);

  const getFileType = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'log':
      case 'txt':
        return 'text';
      case 'json':
        return 'json';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'toml':
        return 'toml';
      case 'xml':
        return 'xml';
      case 'sh':
      case 'bash':
        return 'shell';
      default:
        return 'unknown';
    }
  };

  const fileType = getFileType(filePath);
  const isViewable = ['text', 'json', 'yaml', 'toml', 'xml', 'shell'].includes(fileType);

  // Reset state when file changes
  useEffect(() => {
    setContent(null);
    setError(null);
    setLoadedSize(null);
    setLoading(true);
    currentRequestRef.current = filePath; // Mark this as the current request
  }, [filePath]);

  // Auto-load viewable files
  useEffect(() => {
    if (isViewable) {
      loadFile();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, isViewable]);

  const loadFile = async () => {
    const requestId = filePath; // Capture current filePath
    
    try {
      setLoading(true);
      setError(null);
      
      const blob = await extractFileFromDump(sourceUrl, runId, network, elClient, clClient, filePath);
      
      // Check if this request is still current
      if (currentRequestRef.current !== requestId) {
        return; // Request was superseded, ignore the result
      }
      
      setLoadedSize(blob.size);
      
      // Check if file is too large (limit to 5MB for text viewing)
      if (blob.size > 5 * 1024 * 1024) {
        if (currentRequestRef.current === requestId) {
          setError('File is too large to display. Please download it instead.');
        }
        return;
      }
      
      // Try to read as text
      const text = await blob.text();
      
      // Check again if this request is still current before setting content
      if (currentRequestRef.current === requestId) {
        setContent(text);
      }
    } catch (err) {
      // Only set error if this request is still current
      if (currentRequestRef.current === requestId) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
      }
    } finally {
      // Only set loading to false if this request is still current
      if (currentRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  const downloadFile = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const blob = await extractFileFromDump(sourceUrl, runId, network, elClient, clClient, filePath);
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop() || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>📄</span>
            <span className="font-mono text-sm">{filePath}</span>
            {fileSize && <Badge variant="outline">{formatBytes(fileSize)}</Badge>}
          </div>
          <div className="flex gap-2">
            {loading && isViewable && (
              <Badge variant="outline" className="text-xs">
                Loading...
              </Badge>
            )}
            <Button onClick={downloadFile} disabled={loading} size="sm" variant="outline">
              Download
            </Button>
            {onClose && (
              <Button onClick={onClose} size="sm" variant="ghost">
                ×
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      {(content || error || (loading && isViewable)) && (
        <CardContent>
          {error ? (
            <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
          ) : content ? (
            <div>
              {loadedSize && (
                <div className="text-xs text-muted-foreground mb-2">
                  Loaded: {formatBytes(loadedSize)}
                </div>
              )}
              <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
                <code>{content}</code>
              </pre>
            </div>
          ) : loading && isViewable ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2 text-sm text-muted-foreground">Loading file content...</span>
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

export default FileViewer;