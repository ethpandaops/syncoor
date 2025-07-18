import React from 'react';
import { TestReport, ProgressEntry } from '../../types/report';
import {
  SyncProgressChart,
  DiskUsageChart,
  PeerCountChart,
  PerformanceMatrix
} from './index';

interface ChartExampleProps {
  testReports: TestReport[];
  progressData: ProgressEntry[];
}

/**
 * Example component demonstrating how to use all the chart components
 * This component shows the typical usage patterns and layouts
 */
const ChartExample: React.FC<ChartExampleProps> = ({
  testReports,
  progressData
}) => {
  return (
    <div className="space-y-8 p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sync Progress Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Sync Progress Over Time</h3>
          <SyncProgressChart
            data={progressData}
            height={300}
            colors={{
              blocks: '#3b82f6',
              slots: '#10b981'
            }}
          />
        </div>

        {/* Disk Usage Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Disk Usage Growth</h3>
          <DiskUsageChart
            data={progressData}
            height={300}
            colors={{
              execution: '#f59e0b',
              consensus: '#8b5cf6'
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Peer Count Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Peer Connectivity</h3>
          <PeerCountChart
            data={progressData}
            height={300}
            colors={{
              execution: '#ef4444',
              consensus: '#06b6d4'
            }}
          />
        </div>

        {/* Performance Matrix for different metrics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Performance Comparison</h3>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                Duration
              </button>
              <button className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-sm">
                Sync Rate
              </button>
              <button className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-sm">
                Disk Usage
              </button>
            </div>
            <PerformanceMatrix
              data={testReports}
              metric="duration"
              showTooltips={true}
            />
          </div>
        </div>
      </div>

      {/* Full-width Performance Matrix */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Client Performance Matrix</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">Sync Duration</h4>
            <PerformanceMatrix
              data={testReports}
              metric="duration"
              showTooltips={true}
            />
          </div>
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">Sync Rate</h4>
            <PerformanceMatrix
              data={testReports}
              metric="sync_rate"
              showTooltips={true}
            />
          </div>
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">Final Disk Usage</h4>
            <PerformanceMatrix
              data={testReports}
              metric="disk_usage"
              showTooltips={true}
            />
          </div>
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">Average Peers</h4>
            <PerformanceMatrix
              data={testReports}
              metric="peer_count"
              showTooltips={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartExample;