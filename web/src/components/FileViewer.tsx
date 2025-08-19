import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { extractFileFromDump } from '../lib/api';
import { formatBytes } from '../lib/utils';
// @ts-ignore
import Convert from 'ansi-to-html';

interface FileViewerProps {
  sourceUrl: string;
  runId: string;
  network: string;
  elClient: string;
  clClient: string;
  filePath: string;
  fileSize?: number;
  onClose?: () => void;
  initialFullWindow?: boolean;
  onFullWindowToggle?: (fullWindow: boolean) => void;
}

export function FileViewer({ 
  sourceUrl, 
  runId, 
  network, 
  elClient, 
  clClient, 
  filePath, 
  fileSize,
  onClose,
  initialFullWindow = false,
  onFullWindowToggle
}: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedSize, setLoadedSize] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [fullWindow, setFullWindow] = useState(initialFullWindow);
  const currentRequestRef = useRef<string | null>(null);

  // Update full window state when initialFullWindow changes
  useEffect(() => {
    setFullWindow(initialFullWindow);
  }, [initialFullWindow]);

  const toggleFullWindow = useCallback(() => {
    const newFullWindow = !fullWindow;
    setFullWindow(newFullWindow);
    if (onFullWindowToggle) {
      onFullWindowToggle(newFullWindow);
    }
  }, [fullWindow, onFullWindowToggle]);

  // Add ESC key listener for full window mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && fullWindow) {
        toggleFullWindow();
      }
    };

    if (fullWindow) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullWindow, toggleFullWindow]);

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

  const copyContent = async () => {
    if (!content) return;
    
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  };

  // Function to detect and convert ANSI codes
  const renderContent = (text: string) => {
    // Check if the first line contains ANSI escape sequences (for performance)
    const firstLine = text.split('\n')[0];
    const ansiRegex = /\x1b\[[0-9;]*m/;
    
    if (ansiRegex.test(firstLine)) {
      // Convert ANSI to HTML
      const convert = new Convert({
        fg: '#000',
        bg: '#FFF',
        newline: true,
        escapeXML: true,
        stream: false
      });
      
      const htmlContent = convert.toHtml(text);
      
      return (
        <div 
          className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
          style={{ 
            background: 'var(--muted)',
            color: 'var(--foreground)',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word'
          }}
        />
      );
    }
    
    // Regular text rendering
    return (
      <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
        <code>{text}</code>
      </pre>
    );
  };

  if (fullWindow && content) {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-auto">
        <div className="sticky top-0 bg-background border-b p-4">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span>📄</span>
              <span className="font-mono text-sm">{filePath}</span>
              {loadedSize && <Badge variant="outline">{formatBytes(loadedSize)}</Badge>}
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={copyContent} 
                size="sm" 
                variant="outline"
                className={copied ? 'text-green-600' : ''}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </Button>
              <Button onClick={downloadFile} size="sm" variant="outline">
                Download
              </Button>
              <Button onClick={toggleFullWindow} size="sm" variant="outline">
                Exit Full Window
              </Button>
            </div>
          </div>
        </div>
        <div className="p-4 w-full">
          {(() => {
            // Check if the first line contains ANSI escape sequences (for performance)
            const firstLine = content.split('\n')[0];
            const ansiRegex = /\x1b\[[0-9;]*m/;
            if (ansiRegex.test(firstLine)) {
              const convert = new Convert({
                fg: '#000',
                bg: '#FFF',
                newline: true,
                escapeXML: true,
                stream: false
              });
              
              const htmlContent = convert.toHtml(content);
              
              return (
                <div 
                  className="text-xs font-mono bg-muted p-6 rounded-lg overflow-x-auto w-full"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                  style={{ 
                    background: 'var(--muted)',
                    color: 'var(--foreground)',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word'
                  }}
                />
              );
            }
            
            return (
              <pre className="text-xs font-mono bg-muted p-6 rounded-lg overflow-x-auto w-full">
                <code>{content}</code>
              </pre>
            );
          })()}
        </div>
      </div>
    );
  }

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
            {content && (
              <Button 
                onClick={copyContent} 
                size="sm" 
                variant="outline"
                className={copied ? 'text-green-600' : ''}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </Button>
            )}
            <Button onClick={downloadFile} disabled={loading} size="sm" variant="outline">
              Download
            </Button>
            {content && (
              <Button onClick={toggleFullWindow} size="sm" variant="outline">
                Full Window
              </Button>
            )}
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
              {renderContent(content)}
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