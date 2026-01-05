import { Routes, Route } from 'react-router-dom'
import { Layout, ErrorBoundary } from './components'
import Dashboard from './pages/Dashboard'
import TestList from './pages/TestList'
import TestDetails from './pages/TestDetails'
import DumpExplorer from './pages/DumpExplorer'
import ControlCenter from './pages/ControlCenter'
import { useConfig } from './hooks'

function App() {
  const { data: config, isLoading, error } = useConfig();

  // Check if we're in control center mode
  const isControlCenterMode = config?.mode === 'control-center';
  const controlCenterEndpoint = config?.controlCenterEndpoint;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8">
          <h1 className="text-xl font-bold text-red-600 mb-2">Configuration Error</h1>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  // Control Center mode
  if (isControlCenterMode && controlCenterEndpoint) {
    return (
      <ErrorBoundary>
        <Layout>
          <Routes>
            <Route path="/" element={<ControlCenter endpoint={controlCenterEndpoint} />} />
            <Route path="*" element={<ControlCenter endpoint={controlCenterEndpoint} />} />
          </Routes>
        </Layout>
      </ErrorBoundary>
    );
  }

  // Default mode
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tests" element={<TestList />} />
          <Route path="/test/:directory/:id" element={<TestDetails />} />
          <Route path="/test/:id" element={<TestDetails />} />
          <Route path="/dump/:id" element={<DumpExplorer />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  )
}

export default App