import { useState, useRef, useEffect, ReactNode } from 'react';

interface ResizablePanelProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  defaultLeftWidth?: number; // percentage
  minLeftWidth?: number; // percentage
  maxLeftWidth?: number; // percentage
  storageKey?: string; // for persisting width
}

export function ResizablePanel({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 33,
  minLeftWidth = 20,
  maxLeftWidth = 60,
  storageKey
}: ResizablePanelProps) {
  // Get initial width from storage or use default
  const getInitialWidth = () => {
    if (storageKey) {
      const stored = localStorage.getItem(`resizable-panel-${storageKey}`);
      if (stored) {
        const width = parseFloat(stored);
        if (width >= minLeftWidth && width <= maxLeftWidth) {
          return width;
        }
      }
    }
    return defaultLeftWidth;
  };

  const [leftWidth, setLeftWidth] = useState(getInitialWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Save width to storage
  useEffect(() => {
    if (storageKey && !isDragging) {
      localStorage.setItem(`resizable-panel-${storageKey}`, leftWidth.toString());
    }
  }, [leftWidth, storageKey, isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = leftWidth;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.offsetWidth;
      const deltaX = e.clientX - dragStartX.current;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const newWidth = dragStartWidth.current + deltaPercent;

      // Constrain to min/max
      const constrainedWidth = Math.max(minLeftWidth, Math.min(maxLeftWidth, newWidth));
      setLeftWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minLeftWidth, maxLeftWidth]);

  return (
    <div
      ref={containerRef}
      className="flex h-full"
      style={{ cursor: isDragging ? 'col-resize' : 'default' }}
    >
      {/* Left Panel */}
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{ width: `${leftWidth}%` }}
      >
        {leftPanel}
      </div>

      {/* Resize Handle */}
      <div
        className={`group flex-shrink-0 w-1 bg-border hover:bg-primary/30 cursor-col-resize transition-all relative ${
          isDragging ? 'bg-primary/40 w-1.5' : ''
        }`}
        onMouseDown={handleMouseDown}
        title="Drag to resize panels"
      >
        {/* Visual indicator - dots in the middle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1">
          <div className="w-1 h-1 bg-muted-foreground/40 rounded-full group-hover:bg-primary/60 transition-colors" />
          <div className="w-1 h-1 bg-muted-foreground/40 rounded-full group-hover:bg-primary/60 transition-colors" />
          <div className="w-1 h-1 bg-muted-foreground/40 rounded-full group-hover:bg-primary/60 transition-colors" />
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 overflow-hidden">
        {rightPanel}
      </div>
    </div>
  );
}