import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { extractFileFromDump } from '../lib/api';
import { formatBytes } from '../lib/utils';
import Convert from 'ansi-to-html';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';

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
  const [highlightedLines, setHighlightedLines] = useState<number[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const currentRequestRef = useRef<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

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

  // Handle line highlighting from URL parameters
  useEffect(() => {
    const lineParam = searchParams.get('lines');
    if (lineParam) {
      const lines = lineParam.split(',').map(line => {
        if (line.includes('-')) {
          const [start, end] = line.split('-').map(Number);
          return Array.from({ length: end - start + 1 }, (_, i) => start + i);
        }
        return [Number(line)];
      }).flat().filter(line => !isNaN(line) && line > 0);
      setHighlightedLines(lines);
    }
  }, [searchParams]);

  // Scroll to highlighted lines when they change and content is loaded
  useEffect(() => {
    if (highlightedLines.length > 0 && content && !loading) {
      // Add a delay to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        const firstHighlightedLine = Math.min(...highlightedLines);
        // Try multiple selectors to find the line element
        let lineElement = contentRef.current?.querySelector(`[data-line-number="${firstHighlightedLine}"]`) as HTMLElement;
        
        if (!lineElement) {
          lineElement = document.querySelector(`[data-line-number="${firstHighlightedLine}"]`) as HTMLElement;
        }
        
        if (lineElement) {
          lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [highlightedLines, content, loading]);

  // Function to handle line clicks for permalinks
  const handleLineClick = (lineNumber: number, event: React.MouseEvent) => {
    event.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    
    if (event.metaKey || event.ctrlKey) {
      // Multi-select with Ctrl/Cmd
      const currentLines = highlightedLines.includes(lineNumber)
        ? highlightedLines.filter(l => l !== lineNumber)
        : [...highlightedLines, lineNumber].sort((a, b) => a - b);
      
      if (currentLines.length === 0) {
        newParams.delete('lines');
      } else {
        newParams.set('lines', currentLines.join(','));
      }
      setHighlightedLines(currentLines);
    } else if (event.shiftKey && highlightedLines.length > 0) {
      // Range select with Shift
      const lastSelected = Math.max(...highlightedLines);
      const start = Math.min(lineNumber, lastSelected);
      const end = Math.max(lineNumber, lastSelected);
      const rangeLines = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      
      newParams.set('lines', `${start}-${end}`);
      setHighlightedLines(rangeLines);
    } else {
      // Single select
      newParams.set('lines', lineNumber.toString());
      setHighlightedLines([lineNumber]);
    }
    
    setSearchParams(newParams);
    
    // Copy permalink to clipboard
    const url = `${window.location.origin}${window.location.pathname}#${window.location.hash.split('?')[0]}?${newParams.toString()}`;
    navigator.clipboard.writeText(url).catch(() => {
      // Fallback if clipboard API is not available - ignore silently
    });
  };

  const getFileType = (path: string): string => {
    const fileName = path.split('/').pop()?.toLowerCase() || '';
    
    // Check for specific filenames first
    if (fileName === 'jwtsecret') {
      return 'text';
    }
    
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
      // Failed to copy content - ignore silently
    }
  };

  // Function to render content with line numbers
  const renderContentWithLineNumbers = (text: string, isFullWindow = false) => {
    const lines = text.split('\n');
    
    const heightClass = isFullWindow 
      ? "h-full" 
      : "max-h-96";
    
    return (
      <div ref={contentRef} className={`text-xs font-mono bg-muted rounded-lg overflow-hidden ${heightClass} overflow-y-auto`} style={{ overflowX: 'auto' }}>
        <div className="flex min-w-fit">
          {/* Line numbers */}
          <div className="bg-muted-foreground/10 px-4 py-4 select-none border-r border-border sticky left-0 flex-shrink-0" style={{ minHeight: '100%' }}>
            <div className="flex flex-col h-full">
              {lines.map((_, index) => (
                <div
                  key={index}
                  data-line-number={index + 1}
                  className={`cursor-pointer hover:bg-muted-foreground/20 px-2 py-0.5 text-right min-w-[3rem] ${
                    highlightedLines.includes(index + 1) 
                      ? 'bg-blue-500/20 text-blue-600 font-semibold' 
                      : 'text-muted-foreground'
                  }`}
                  onClick={(e) => handleLineClick(index + 1, e)}
                  title="Click to select line, Ctrl+click to multi-select, Shift+click for range"
                  style={{ height: '1.25rem', lineHeight: '1.25rem' }}
                >
                  {index + 1}
                </div>
              ))}
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 px-4 py-4 min-w-0">
            {renderContentByType(text, lines)}
          </div>
        </div>
      </div>
    );
  };

  // Function to detect and convert ANSI codes or apply syntax highlighting
  const renderContentByType = (text: string, lines: string[]) => {
    // Check if the first line contains ANSI escape sequences (for performance)
    const firstLine = text.split('\n')[0];
    const ansiRegex = /\x1b\[[0-9;]*m/;
    
    // Handle ANSI content line by line
    if (ansiRegex.test(firstLine)) {
      return (
        <div>
          {lines.map((line, index) => {
            const lineNumber = index + 1;
            const isHighlighted = highlightedLines.includes(lineNumber);
            
            const convert = new Convert({
              fg: '#000',
              bg: '#FFF',
              newline: false,
              escapeXML: true,
              stream: false
            });
            
            const htmlContent = convert.toHtml(line);
            
            return (
              <div
                key={index}
                className={`${isHighlighted ? 'bg-blue-500/10' : ''} whitespace-nowrap`}
                style={{ height: '1.25rem', lineHeight: '1.25rem' }}
              >
                <span
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                  style={{ 
                    whiteSpace: 'pre',
                    wordWrap: 'normal'
                  }}
                />
              </div>
            );
          })}
        </div>
      );
    }
    
    // Handle JSON and YAML with full-file syntax highlighting
    if (fileType === 'json') {
      try {
        const highlightedHtml = Prism.highlight(text, Prism.languages.json, 'json');
        const htmlLines = highlightedHtml.split('\n');
        
        return (
          <div>
            <style dangerouslySetInnerHTML={{
              __html: `
                .syntax-json .token.property { color: #0066cc; }
                .syntax-json .token.string { color: #22863a; }
                .syntax-json .token.number { color: #005cc5; }
                .syntax-json .token.boolean { color: #d73a49; }
                .syntax-json .token.null { color: #6f42c1; }
                .syntax-json .token.punctuation { color: #586069; }
              `
            }} />
            {htmlLines.map((htmlLine, index) => {
              const lineNumber = index + 1;
              const isHighlighted = highlightedLines.includes(lineNumber);
              
              return (
                <div
                  key={index}
                  className={`syntax-json ${isHighlighted ? 'bg-blue-500/10' : ''}`}
                  style={{ 
                    height: '1.25rem', 
                    lineHeight: '1.25rem', 
                    textShadow: 'none',
                    whiteSpace: 'pre',
                    overflow: 'visible'
                  }}
                  dangerouslySetInnerHTML={{ __html: htmlLine }}
                />
              );
            })}
          </div>
        );
      } catch (e) {
        // Fallback to plain text
        return renderPlainText(lines);
      }
    }
    
    if (fileType === 'yaml') {
      try {
        const highlightedHtml = Prism.highlight(text, Prism.languages.yaml, 'yaml');
        const htmlLines = highlightedHtml.split('\n');
        
        return (
          <div>
            <style dangerouslySetInnerHTML={{
              __html: `
                .syntax-yaml .token.key { color: #0066cc; }
                .syntax-yaml .token.string { color: #22863a; }
                .syntax-yaml .token.number { color: #005cc5; }
                .syntax-yaml .token.boolean { color: #d73a49; }
                .syntax-yaml .token.null { color: #6f42c1; }
                .syntax-yaml .token.punctuation { color: #586069; }
                .syntax-yaml .token.comment { color: #6a737d; font-style: italic; }
              `
            }} />
            {htmlLines.map((htmlLine, index) => {
              const lineNumber = index + 1;
              const isHighlighted = highlightedLines.includes(lineNumber);
              
              return (
                <div
                  key={index}
                  className={`syntax-yaml ${isHighlighted ? 'bg-blue-500/10' : ''}`}
                  style={{ 
                    height: '1.25rem', 
                    lineHeight: '1.25rem', 
                    textShadow: 'none',
                    whiteSpace: 'pre',
                    overflow: 'visible'
                  }}
                  dangerouslySetInnerHTML={{ __html: htmlLine }}
                />
              );
            })}
          </div>
        );
      } catch (e) {
        // Fallback to plain text
        return renderPlainText(lines);
      }
    }
    
    // Regular text rendering
    return renderPlainText(lines);
  };

  // Helper function for plain text rendering
  const renderPlainText = (lines: string[]) => {
    return (
      <div>
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const isHighlighted = highlightedLines.includes(lineNumber);
          
          return (
            <div
              key={index}
              className={`${isHighlighted ? 'bg-blue-500/10' : ''} whitespace-nowrap`}
              style={{ height: '1.25rem', lineHeight: '1.25rem' }}
            >
              <span>{line}</span>
            </div>
          );
        })}
      </div>
    );
  };

  if (fullWindow && content) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="bg-background border-b p-4 flex-shrink-0">
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
        <div className="flex-1 p-4 min-h-0">
          {renderContentWithLineNumbers(content, true)}
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
              {renderContentWithLineNumbers(content, false)}
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