import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ProgressEntry } from '../../types/report';
import { formatTimestamp, formatBytes } from '../../lib/utils';

interface DiskUsageChartProps {
  data: ProgressEntry[];
  className?: string;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  colors?: {
    execution?: string;
    consensus?: string;
  };
}

interface ChartDataPoint {
  timestamp: number;
  formattedTime: string;
  execution: number;
  consensus: number;
  total: number;
}

const DiskUsageChart: React.FC<DiskUsageChartProps> = ({
  data,
  className = '',
  height = 400,
  showLegend = true,
  showGrid = true,
  colors = {
    execution: '#3b82f6',
    consensus: '#10b981',
  },
}) => {
  // Transform data for the chart
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    return data
      .sort((a, b) => a.t - b.t)
      .map((entry) => ({
        timestamp: entry.t,
        formattedTime: formatTimestamp(entry.t),
        execution: entry.de,
        consensus: entry.dc,
        total: entry.de + entry.dc,
      }));
  }, [data]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint; dataKey: string; value: number; color: string }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as ChartDataPoint;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800 mb-2">{data.formattedTime}</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.execution }}
              />
              <span className="text-gray-600">Execution Client:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.execution)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.consensus }}
              />
              <span className="text-gray-600">Consensus Client:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.consensus)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm pt-1 border-t">
              <span className="text-gray-600 font-medium">Total:</span>
              <span className="font-semibold text-gray-800">
                {formatBytes(data.total)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Format tick values for Y-axis (bytes)
  const formatYAxisTick = (value: number): string => {
    return formatBytes(value, 0);
  };

  // Format tick values for X-axis (timestamps)
  const formatXAxisTick = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`} style={{ height }}>
        <div className="text-center text-gray-500">
          <p className="text-lg font-medium">No disk usage data available</p>
          <p className="text-sm">Data will appear here once disk usage is recorded</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 60,
          }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
          )}
          
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatXAxisTick}
            stroke="#6b7280"
            fontSize={12}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
          />
          
          <YAxis
            tickFormatter={formatYAxisTick}
            stroke="#6b7280"
            fontSize={12}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          {showLegend && (
            <Legend
              wrapperStyle={{
                paddingTop: '0px',
                fontSize: '14px',
                color: '#374151',
              }}
            />
          )}
          
          <Area
            type="monotone"
            dataKey="execution"
            stackId="1"
            stroke={colors.execution}
            fill={colors.execution}
            fillOpacity={0.6}
            name="Execution Client"
          />
          
          <Area
            type="monotone"
            dataKey="consensus"
            stackId="1"
            stroke={colors.consensus}
            fill={colors.consensus}
            fillOpacity={0.6}
            name="Consensus Client"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DiskUsageChart;