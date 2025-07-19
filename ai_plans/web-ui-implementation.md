# Syncoor Web UI Implementation Plan

## Executive Summary
> The Syncoor project currently lacks a web interface for visualizing sync test results. This plan outlines the implementation of a React-based web UI that will:
> - Display real-time and historical sync test data from multiple report directories
> - Provide interactive visualizations for performance metrics
> - Support multiple data sources via configurable endpoints
> - Integrate with the existing Go API server for live updates
> - Enable comparative analysis across different Ethereum client combinations

## Goals & Objectives
### Primary Goals
- **Visualization Platform**: Create an intuitive web interface for viewing sync test results with charts showing blocks/slots over time, resource usage, and peer connectivity
- **Multi-Source Support**: Enable reading from multiple report directories via configurable HTTP endpoints, supporting distributed test environments

### Secondary Objectives
- **Real-time Updates**: Integrate with the existing SSE API for live test monitoring
- **Performance Analysis**: Provide tools for comparing sync performance across different client combinations
- **Responsive Design**: Ensure the UI works well on desktop and tablet devices
- **Data Export**: Allow users to export data for external analysis

## Solution Overview
### Approach
Build a modern React application using Radix UI components for consistent design, with Recharts for data visualization. The app will read from a config.json file to determine report sources and fetch data from multiple endpoints. The architecture separates data fetching, state management, and UI components for maintainability.

### Key Components
1. **Configuration System**: Reads config.json to determine available report directories and their HTTP endpoints
2. **Data Layer**: Services for fetching and caching report data from multiple sources
3. **Visualization Components**: Interactive charts for sync progress, resource usage, and performance metrics
4. **Dashboard Views**: Overview page, test list, and detailed test analysis screens
5. **Real-time Integration**: Optional SSE connection to the Syncoor API for live updates

### Architecture Diagram
```
[Config.json] → [React App] → [Report Endpoints]
                    ↓              ↓
              [State Management] ← [index.json]
                    ↓              ↓
              [UI Components] ← [progress.json]
                    ↓
              [Visualizations]
```

### Data Flow
```
config.json → App Initialization → Fetch Directory Indexes
     ↓                                    ↓
Directory URLs → HTTP Requests → Parse index.json files
     ↓                                    ↓
Aggregate Data → State Store → React Components
     ↓                                    ↓
User Interaction → Route Changes → Detailed Views
```

### Expected Outcomes
- Users can browse all sync tests across multiple report directories through a unified interface
- Interactive charts display sync progress, disk usage, and peer counts over time
- Comparative views show performance differences between client combinations
- The web UI can be deployed alongside the Syncoor server or as a standalone static site

## Implementation Tasks

### CRITICAL IMPLEMENTATION RULES
1. **NO PLACEHOLDER CODE**: Every implementation must be production-ready. NEVER write "TODO", "in a real implementation", or similar placeholders unless explicitly requested by the user.
2. **CROSS-DIRECTORY TASKS**: Group related changes across directories into single tasks to ensure consistency. Never create isolated changes that require follow-up work in sibling directories.
3. **COMPLETE IMPLEMENTATIONS**: Each task must fully implement its feature including all consumers, type updates, and integration points.
4. **DETAILED SPECIFICATIONS**: Each task must include EXACTLY what to implement, including specific functions, types, and integration points to avoid "breaking change" confusion.
5. **CONTEXT AWARENESS**: Each task is part of a larger system - specify how it connects to other parts.
6. **MAKE BREAKING CHANGES**: Unless explicitly requested by the user, you MUST make breaking changes.

### Visual Dependency Tree
```
web/
├── package.json (Task #0: Initialize React project with all dependencies)
├── tsconfig.json (Task #0: TypeScript configuration)
├── vite.config.ts (Task #0: Vite build configuration)
├── index.html (Task #0: HTML entry point)
│
├── public/
│   └── config.json (Task #1: Default configuration file)
│
├── src/
│   ├── main.tsx (Task #8: React app entry point with providers)
│   ├── App.tsx (Task #8: Main app component with routing)
│   │
│   ├── types/
│   │   ├── config.ts (Task #2: Configuration types)
│   │   ├── report.ts (Task #2: Report data types)
│   │   └── api.ts (Task #2: API response types)
│   │
│   ├── lib/
│   │   ├── config.ts (Task #3: Config loading utilities)
│   │   ├── api.ts (Task #3: HTTP client for fetching reports)
│   │   └── utils.ts (Task #3: Date formatting, data calculations)
│   │
│   ├── hooks/
│   │   ├── useConfig.ts (Task #4: Hook for config management)
│   │   ├── useReports.ts (Task #4: Hook for fetching report data)
│   │   └── useTestDetails.ts (Task #4: Hook for individual test data)
│   │
│   ├── components/
│   │   ├── ui/ (Task #5: Radix UI component wrappers)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── table.tsx
│   │   │   └── select.tsx
│   │   │
│   │   ├── layout/
│   │   │   ├── Header.tsx (Task #6: App header with navigation)
│   │   │   ├── Layout.tsx (Task #6: Main layout wrapper)
│   │   │   └── Sidebar.tsx (Task #6: Directory selector sidebar)
│   │   │
│   │   └── charts/
│   │       ├── SyncProgressChart.tsx (Task #7: Block/slot progress visualization)
│   │       ├── DiskUsageChart.tsx (Task #7: Disk usage over time)
│   │       ├── PeerCountChart.tsx (Task #7: Peer connectivity chart)
│   │       └── PerformanceMatrix.tsx (Task #7: Client comparison grid)
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx (Task #9: Overview page with summary stats)
│   │   ├── TestList.tsx (Task #9: Paginated test list with filters)
│   │   ├── TestDetails.tsx (Task #9: Individual test analysis)
│   │   └── Compare.tsx (Task #9: Multi-test comparison view)
│   │
│   └── styles/
│       └── globals.css (Task #5: Global styles and Tailwind imports)
```

### Execution Plan

#### Group A: Foundation (Execute all in parallel)
- [x] **Task #0**: Initialize React project with Vite
  - Folder: `web/`
  - Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
  - Dependencies to install:
    - React 18.x, React DOM, React Router
    - TypeScript, @types/react, @types/react-dom
    - Vite, @vitejs/plugin-react
    - Tailwind CSS, autoprefixer, postcss
    - Radix UI: @radix-ui/react-select, @radix-ui/react-dialog, @radix-ui/react-tabs
    - Recharts for charting
    - Tanstack Query for data fetching
    - date-fns for date manipulation
    - clsx for className utilities
  - Vite config: React plugin, resolve aliases for @ imports
  - TypeScript config: React JSX, strict mode, path aliases
  - HTML entry: Basic template with root div

- [x] **Task #1**: Create default configuration file
  - Folder: `web/public/`
  - File: `config.json`
  - Content:
    ```json
    {
      "directories": [
        {
          "name": "Local Reports",
          "url": "http://localhost:8080/reports/",
          "enabled": true
        }
      ],
      "refreshInterval": 30000,
      "theme": "light"
    }
    ```
  - Purpose: Default configuration for development

#### Group B: Core Types and Utilities (Execute all in parallel after Group A)
- [x] **Task #2**: Create TypeScript type definitions
  - Folder: `web/src/types/`
  - Files and interfaces:
    - `config.ts`:
      ```typescript
      interface Directory {
        name: string;
        url: string;
        enabled: boolean;
      }
      interface Config {
        directories: Directory[];
        refreshInterval: number;
        theme: 'light' | 'dark';
      }
      ```
    - `report.ts`:
      ```typescript
      interface IndexEntry {
        run_id: string;
        timestamp: number;
        network: string;
        execution_client_info: ClientInfo;
        consensus_client_info: ClientInfo;
        sync_info: SyncInfo;
        main_file: string;
        progress_file: string;
      }
      interface ProgressEntry {
        t: number;  // timestamp
        b: number;  // block
        s: number;  // slot
        de: number; // disk execution
        dc: number; // disk consensus
        pe: number; // peers execution
        pc: number; // peers consensus
      }
      interface ReportIndex {
        generated: number;
        entries: IndexEntry[];
      }
      ```
    - `api.ts`: Types for API responses if integrating with live server
  - Exports: All interfaces for use throughout the app

- [x] **Task #3**: Create utility libraries
  - Folder: `web/src/lib/`
  - Files and functions:
    - `config.ts`:
      - `loadConfig(): Promise<Config>` - Fetches and validates config.json
      - `validateConfig(data: unknown): Config` - Runtime validation
    - `api.ts`:
      - `fetchIndex(directory: Directory): Promise<ReportIndex>`
      - `fetchProgress(directory: Directory, filename: string): Promise<ProgressEntry[]>`
      - `fetchMainReport(directory: Directory, filename: string): Promise<TestReport>`
      - HTTP error handling and retry logic
    - `utils.ts`:
      - `formatDuration(seconds: number): string`
      - `formatBytes(bytes: number): string`
      - `calculateSyncRate(entries: ProgressEntry[]): number`
      - `getClientDisplayName(info: ClientInfo): string`
  - Context: Core utilities used by hooks and components

#### Group C: React Infrastructure (Execute all in parallel after Group B)
- [x] **Task #4**: Create React hooks for data management
  - Folder: `web/src/hooks/`
  - Implementations:
    - `useConfig.ts`:
      - Uses Tanstack Query to load and cache config
      - Provides config state and refetch capability
      - Handles loading and error states
    - `useReports.ts`:
      - Fetches indexes from all enabled directories
      - Aggregates and sorts results
      - Provides filtering and pagination
    - `useTestDetails.ts`:
      - Loads main report and progress data for a specific test
      - Caches results to avoid refetching
      - Provides computed metrics
  - Integration: All hooks use the lib/api functions

- [x] **Task #5**: Setup UI component library
  - Folder: `web/src/components/ui/`
  - Files:
    - Radix UI wrappers with Tailwind styling
    - Each component exports styled version
    - Consistent design tokens
  - `web/src/styles/globals.css`:
    - Tailwind imports
    - CSS variables for theming
    - Base styles
  - Context: Reusable UI components for the entire app

- [x] **Task #6**: Create layout components
  - Folder: `web/src/components/layout/`
  - Components:
    - `Header.tsx`: App title, navigation links, theme toggle
    - `Sidebar.tsx`: Directory selector with enable/disable toggles
    - `Layout.tsx`: Wrapper combining header, sidebar, and content area
  - Features: Responsive design, collapsible sidebar on mobile
  - Integration: Uses UI components from Task #5

- [x] **Task #7**: Implement data visualization charts
  - Folder: `web/src/components/charts/`
  - Charts using Recharts:
    - `SyncProgressChart.tsx`: Line chart for blocks/slots over time
    - `DiskUsageChart.tsx`: Area chart for disk growth
    - `PeerCountChart.tsx`: Line chart for peer connectivity
    - `PerformanceMatrix.tsx`: Heatmap grid of client combinations
  - Features: Responsive, interactive tooltips, zoom capability
  - Props: Accept progress data and configuration options

#### Group D: Application Assembly (Execute all in parallel after Group C)
- [x] **Task #8**: Create main application entry
  - Files:
    - `web/src/main.tsx`:
      - React DOM root creation
      - Tanstack Query provider setup
      - Router provider wrapper
    - `web/src/App.tsx`:
      - Route definitions
      - Layout wrapper
      - Global error boundary
  - Routes: /, /tests, /test/:id, /compare
  - Integration: Combines all providers and routing

- [x] **Task #9**: Implement page components
  - Folder: `web/src/pages/`
  - Pages:
    - `Dashboard.tsx`:
      - Summary statistics cards
      - Recent tests list
      - Performance overview charts
    - `TestList.tsx`:
      - Filterable, sortable table of all tests
      - Search by client, network, date range
      - Pagination controls
    - `TestDetails.tsx`:
      - Full test information display
      - All charts for the specific test
      - Configuration details
    - `Compare.tsx`:
      - Side-by-side test comparison
      - Overlay charts for multiple tests
  - Integration: Uses hooks from Task #4 and charts from Task #7

---

## Implementation Workflow

This plan file serves as the authoritative checklist for implementation. When implementing:

### Required Process
1. **Load Plan**: Read this entire plan file before starting
2. **Sync Tasks**: Create TodoWrite tasks matching the checkboxes below
3. **Execute & Update**: For each task:
   - Mark TodoWrite as `in_progress` when starting
   - Update checkbox `[ ]` to `[x]` when completing
   - Mark TodoWrite as `completed` when done
4. **Maintain Sync**: Keep this file and TodoWrite synchronized throughout

### Critical Rules
- This plan file is the source of truth for progress
- Update checkboxes in real-time as work progresses
- Never lose synchronization between plan file and TodoWrite
- Mark tasks complete only when fully implemented (no placeholders)
- Tasks should be run in parallel, unless there are dependencies, using subtasks, to avoid context bloat.

### Progress Tracking
The checkboxes above represent the authoritative status of each task. Keep them updated as you work.