import { Routes, Route } from 'react-router-dom'
import { Layout, ErrorBoundary } from './components'
import Dashboard from './pages/Dashboard'
import TestList from './pages/TestList'
import TestDetails from './pages/TestDetails'

function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tests" element={<TestList />} />
          <Route path="/test/:id" element={<TestDetails />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  )
}

export default App