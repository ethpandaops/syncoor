# Chart Components

This directory contains data visualization components built with Recharts for the Syncoor web application.

## Components

### SyncProgressChart

A line chart showing blocks/slots progress over time with dual Y-axis support.

**Props:**
- `data: ProgressEntry[]` - Array of progress entries
- `className?: string` - Additional CSS classes
- `height?: number` - Chart height (default: 400)
- `showLegend?: boolean` - Show/hide legend (default: true)
- `showGrid?: boolean` - Show/hide grid (default: true)
- `colors?: { blocks?: string, slots?: string }` - Custom colors

**Example:**
```tsx
import { SyncProgressChart } from '../components/charts';

<SyncProgressChart
  data={progressData}
  height={300}
  colors={{ blocks: '#3b82f6', slots: '#10b981' }}
/>
```

### DiskUsageChart

An area chart showing disk usage growth over time for execution and consensus clients.

**Props:**
- `data: ProgressEntry[]` - Array of progress entries
- `className?: string` - Additional CSS classes
- `height?: number` - Chart height (default: 400)
- `showLegend?: boolean` - Show/hide legend (default: true)
- `showGrid?: boolean` - Show/hide grid (default: true)
- `colors?: { execution?: string, consensus?: string }` - Custom colors

**Example:**
```tsx
import { DiskUsageChart } from '../components/charts';

<DiskUsageChart
  data={progressData}
  height={300}
  colors={{ execution: '#f59e0b', consensus: '#8b5cf6' }}
/>
```

### PeerCountChart

A line chart showing peer connectivity over time for execution and consensus clients.

**Props:**
- `data: ProgressEntry[]` - Array of progress entries
- `className?: string` - Additional CSS classes
- `height?: number` - Chart height (default: 400)
- `showLegend?: boolean` - Show/hide legend (default: true)
- `showGrid?: boolean` - Show/hide grid (default: true)
- `colors?: { execution?: string, consensus?: string }` - Custom colors

**Example:**
```tsx
import { PeerCountChart } from '../components/charts';

<PeerCountChart
  data={progressData}
  height={300}
  colors={{ execution: '#ef4444', consensus: '#06b6d4' }}
/>
```

### PerformanceMatrix

A grid/heatmap showing performance comparison across client combinations.

**Props:**
- `data: TestReport[]` - Array of test reports
- `className?: string` - Additional CSS classes
- `metric?: 'duration' | 'sync_rate' | 'disk_usage' | 'peer_count'` - Metric to display (default: 'duration')
- `showTooltips?: boolean` - Show/hide tooltips (default: true)

**Example:**
```tsx
import { PerformanceMatrix } from '../components/charts';

<PerformanceMatrix
  data={testReports}
  metric="duration"
  showTooltips={true}
/>
```

## Data Types

The charts use the following data types from `src/types/report.ts`:

### ProgressEntry
```typescript
interface ProgressEntry {
  t: number;  // timestamp
  b: number;  // blocks
  s: number;  // slots
  de: number; // database size execution
  dc: number; // database size consensus
  pe: number; // peers execution
  pc: number; // peers consensus
}
```

### TestReport
```typescript
interface TestReport {
  run_id: string;
  timestamp: string;
  network: string;
  test_name: string;
  status: 'completed' | 'failed' | 'running';
  execution_client: ClientInfo;
  consensus_client: ClientInfo;
  sync_info: SyncInfo;
  progress?: ProgressEntry[];
  // ... other properties
}
```

## Utility Functions

The charts utilize utility functions from `src/lib/utils.ts`:

- `formatTimestamp(timestamp: number)` - Formats Unix timestamps to readable dates
- `formatBytes(bytes: number)` - Formats byte values to human-readable sizes
- `formatDuration(seconds: number)` - Formats duration in seconds to human-readable format
- `getClientDisplayName(info: ClientInfo)` - Gets display name for clients
- `calculateSyncRate(entries: ProgressEntry[])` - Calculates sync rate from progress entries

## Features

- **Responsive Design**: All charts are responsive and work on different screen sizes
- **Interactive Tooltips**: Hover over data points to see detailed information
- **Customizable Colors**: Each chart supports custom color schemes
- **Empty State Handling**: Charts gracefully handle empty or missing data
- **Performance Optimized**: Charts use `React.useMemo` for data transformation
- **Accessibility**: Charts include proper ARIA attributes and keyboard navigation
- **TypeScript Support**: Full TypeScript support with proper type definitions