import { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, UnfoldVertical, FoldVertical } from 'lucide-react';
import { FileIcon, defaultStyles } from 'react-file-icon';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { formatBytes } from '../lib/utils';
import { ZipFileEntry } from '../types/report';

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, TreeNode>;
  entry?: ZipFileEntry;
  size: number;
  fileCount: number;
}

interface FolderTreeViewProps {
  entries: ZipFileEntry[];
  selectedFile: ZipFileEntry | null;
  onFileSelect: (entry: ZipFileEntry) => void;
  onDownload: (entry: ZipFileEntry) => void;
  searchQuery?: string;
  defaultExpanded?: Set<string>;
  onExpandedChange?: (expanded: Set<string>) => void;
}

export function FolderTreeView({
  entries,
  selectedFile,
  onFileSelect,
  onDownload,
  searchQuery = '',
  defaultExpanded,
  onExpandedChange
}: FolderTreeViewProps) {
  // Create a unique key for this tree instance based on the first few entries
  const storageKey = useMemo(() => {
    const key = entries.slice(0, 3).map(e => e.name).join(',');
    return `folderTree_expanded_${btoa(key).substring(0, 20)}`;
  }, [entries]);

  // Initialize expanded folders from sessionStorage
  const [expandedFolders, setExpandedFoldersState] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (e) {
      // Ignore storage errors
    }
    return defaultExpanded || new Set();
  });

  const [lastSearchQuery, setLastSearchQuery] = useState('');

  // Save to sessionStorage whenever expanded folders change
  const setExpandedFolders = (newExpanded: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setExpandedFoldersState(prev => {
      const result = typeof newExpanded === 'function' ? newExpanded(prev) : newExpanded;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(Array.from(result)));
      } catch (e) {
        // Ignore storage errors
      }
      return result;
    });
  };

  // Build tree structure from flat file list
  const tree = useMemo(() => {
    const root: TreeNode = {
      name: 'root',
      path: '',
      isDirectory: true,
      children: new Map(),
      size: 0,
      fileCount: 0
    };

    // Sort entries to ensure directories come first
    const sortedEntries = [...entries].sort((a, b) => {
      if (a.is_directory && !b.is_directory) return -1;
      if (!a.is_directory && b.is_directory) return 1;
      return a.name.localeCompare(b.name);
    });

    sortedEntries.forEach(entry => {
      const parts = entry.name.split('/').filter(Boolean);
      let currentNode = root;
      let currentPath = '';
      const nodePath: TreeNode[] = [root]; // Track the path to update sizes

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLastPart = index === parts.length - 1;
        const isDirectory = entry.is_directory || !isLastPart;

        if (!currentNode.children.has(part)) {
          const newNode: TreeNode = {
            name: part,
            path: currentPath,
            isDirectory,
            children: new Map(),
            size: 0,
            fileCount: 0
          };

          if (isLastPart && !entry.is_directory) {
            newNode.entry = entry;
            newNode.size = entry.size;
          }

          currentNode.children.set(part, newNode);
        }

        currentNode = currentNode.children.get(part)!;
        nodePath.push(currentNode);
      });

      // Update size and file count for all parent directories (only once per file)
      if (!entry.is_directory) {
        // Update all parent directories except the file itself
        for (let i = 0; i < nodePath.length - 1; i++) {
          nodePath[i].size += entry.size;
          nodePath[i].fileCount += 1;
        }
      }
    });

    return root;
  }, [entries]);

  // Notify parent when expanded folders change
  useEffect(() => {
    if (onExpandedChange) {
      onExpandedChange(expandedFolders);
    }
  }, [expandedFolders, onExpandedChange]);

  // Auto-expand to show selected file
  useEffect(() => {
    if (selectedFile && selectedFile.name) {
      const pathParts = selectedFile.name.split('/').filter(Boolean);
      const pathsToExpand: string[] = [];
      let currentPath = '';

      // Build all parent paths that need to be expanded
      for (let i = 0; i < pathParts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i];
        pathsToExpand.push(currentPath);
      }

      // Expand all parent folders
      if (pathsToExpand.length > 0) {
        setExpandedFolders(prev => {
          const newExpanded = new Set(prev);
          pathsToExpand.forEach(path => newExpanded.add(path));
          return newExpanded;
        });
      }

      // Scroll to selected file after a brief delay to allow expansion
      setTimeout(() => {
        const selectedElement = document.querySelector('[data-selected="true"]');
        if (selectedElement) {
          selectedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  // Handle search query changes for auto-expanding folders
  useEffect(() => {
    // Only process if search query actually changed
    if (searchQuery !== lastSearchQuery) {
      setLastSearchQuery(searchQuery);

      if (searchQuery) {
        const expandedPaths = new Set<string>();
        const searchLower = searchQuery.toLowerCase();

        const expandMatchingPaths = (node: TreeNode, parentPath: string = '') => {
          const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;

          if (node.name.toLowerCase().includes(searchLower)) {
            // Expand all parent folders
            let pathParts = currentPath.split('/');
            for (let i = 1; i <= pathParts.length; i++) {
              expandedPaths.add(pathParts.slice(0, i).join('/'));
            }
          }

          node.children.forEach(child => {
            expandMatchingPaths(child, currentPath);
          });
        };

        tree.children.forEach(child => expandMatchingPaths(child));

        // Merge with existing expanded folders instead of replacing
        setExpandedFolders(prev => {
          const merged = new Set(prev);
          expandedPaths.forEach(path => merged.add(path));
          return merged;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, lastSearchQuery, tree]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  // Get all folder paths from the tree
  const getAllFolderPaths = (node: TreeNode, paths: Set<string> = new Set()): Set<string> => {
    if (node.isDirectory && node.path) {
      paths.add(node.path);
    }
    node.children.forEach(child => getAllFolderPaths(child, paths));
    return paths;
  };

  const expandAll = () => {
    const allPaths = getAllFolderPaths(tree);
    setExpandedFolders(allPaths);
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  const getFileIcon = (fileName: string) => {
    const name = fileName.toLowerCase();
    let ext = fileName.split('.').pop()?.toLowerCase();

    // Handle special cases
    if (name === 'dockerfile') ext = 'docker';
    if (name === 'makefile') ext = 'make';
    if (name === 'readme' || name === 'readme.md') ext = 'md';
    if (name === 'jwtsecret') ext = 'key';

    // Map extensions
    const extensionMap: { [key: string]: string } = {
      yml: 'yaml',
      text: 'txt',
      cc: 'cpp',
      jpeg: 'jpg',
      conf: 'config',
      ini: 'config',
      sqlite: 'db',
      pem: 'key',
      crt: 'key',
      cert: 'key',
      '7z': 'zip',
      tar: 'zip',
      gz: 'zip'
    };

    if (ext && extensionMap[ext]) {
      ext = extensionMap[ext];
    }

    const baseProps = defaultStyles[ext as keyof typeof defaultStyles] || defaultStyles.txt;

    return (
      <FileIcon
        extension={ext || 'txt'}
        {...baseProps}
      />
    );
  };

  const shouldHighlight = (name: string): boolean => {
    if (!searchQuery) return false;
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const renderNode = (node: TreeNode, depth: number = 0): JSX.Element | null => {
    if (node.name === 'root') {
      return (
        <>
          {Array.from(node.children.values()).map(child =>
            renderNode(child, depth)
          )}
        </>
      );
    }

    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFile?.name === node.entry?.name;
    const hasMatch = searchQuery && shouldHighlight(node.name);

    // Filter out non-matching items when searching
    if (searchQuery && !hasMatch && node.isDirectory) {
      // Check if any children match
      const hasMatchingChildren = Array.from(node.children.values()).some(child =>
        shouldHighlight(child.name) ||
        (child.isDirectory && hasChildMatches(child))
      );

      if (!hasMatchingChildren) {
        return null;
      }
    } else if (searchQuery && !hasMatch && !node.isDirectory) {
      return null;
    }

    if (node.isDirectory) {
      return (
        <div key={node.path} className="select-none">
          <div
            className={`flex items-center gap-1.5 py-1 px-2 hover:bg-muted/50 cursor-pointer rounded ${
              hasMatch ? 'bg-yellow-500/10' : ''
            }`}
            style={{ paddingLeft: `${depth * 20 + 8}px` }}
            onClick={() => toggleFolder(node.path)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 text-blue-500" />
            )}
            <span className={`text-sm flex-1 font-medium ${hasMatch ? 'font-bold' : ''}`}>
              {node.name}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 flex items-center">
                {node.fileCount} {node.fileCount === 1 ? 'file' : 'files'}
              </Badge>
              <span className="min-w-[60px] text-right">{formatBytes(node.size)}</span>
            </div>
          </div>
          {isExpanded && (
            <div>
              {Array.from(node.children.values()).map(child =>
                renderNode(child, depth + 1)
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        className={`group flex items-center gap-2 py-0 px-2 hover:bg-muted/50 cursor-pointer rounded ${
          isSelected ? 'bg-primary/10 border-l-2 border-primary' : ''
        } ${hasMatch ? 'bg-yellow-500/10' : ''}`}
        style={{ paddingLeft: `${depth * 20 + (isSelected ? 22 : 24)}px` }}
        onClick={() => node.entry && onFileSelect(node.entry)}
        data-selected={isSelected}
      >
        <div className="flex items-center justify-center" style={{ width: '16px', height: '16px' }}>
          {getFileIcon(node.name)}
        </div>
        <span className={`text-sm flex-1 truncate font-mono ${hasMatch ? 'font-bold' : ''}`} title={node.path}>
          {node.name}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-[60px] text-right">{formatBytes(node.size)}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 !px-0 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              node.entry && onDownload(node.entry);
            }}
            title={`Download ${node.name}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7,10 12,15 17,10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </Button>
        </div>
      </div>
    );
  };

  const hasChildMatches = (node: TreeNode): boolean => {
    if (!searchQuery) return false;

    for (const child of node.children.values()) {
      if (shouldHighlight(child.name)) return true;
      if (child.isDirectory && hasChildMatches(child)) return true;
    }

    return false;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 mb-2 px-2">
        <Button
          variant="outline"
          size="sm"
          onClick={expandAll}
          className="flex items-center gap-1 text-xs"
        >
          <UnfoldVertical className="h-3 w-3" />
          Expand All
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={collapseAll}
          className="flex items-center gap-1 text-xs"
        >
          <FoldVertical className="h-3 w-3" />
          Collapse All
        </Button>
      </div>
      <div className="overflow-auto flex-1">
        {renderNode(tree)}
      </div>
    </div>
  );
}