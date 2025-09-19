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

interface BlockIOReadChartProps {
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
  executionReadRate: number;
  consensusReadRate: number;
  totalReadRate: number;
}

const BlockIOReadChart: React.FC<BlockIOReadChartProps> = ({
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
  // Transform data for the chart - calculate read rates (bytes per second)
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    const filteredData = data
      .filter((entry) =>
        entry.bre !== undefined &&
        entry.brc !== undefined
      )
      .sort((a, b) => a.t - b.t);

    if (filteredData.length < 2) return [];

    const rateData: ChartDataPoint[] = [];

    for (let i = 1; i < filteredData.length; i++) {
      const current = filteredData[i];
      const previous = filteredData[i - 1];

      const timeDiff = current.t - previous.t;
      if (timeDiff <= 0) continue; // Skip if no time difference

      // Calculate read rates (bytes per second)
      const executionReadRate = Math.max(0, (current.bre - previous.bre) / timeDiff);
      const consensusReadRate = Math.max(0, (current.brc - previous.brc) / timeDiff);

      rateData.push({
        timestamp: current.t,
        formattedTime: formatTimestamp(current.t),
        executionReadRate,
        consensusReadRate,
        totalReadRate: executionReadRate + consensusReadRate,
      });
    }

    return rateData;
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
                className="size-3 rounded-full"
                style={{ backgroundColor: colors.execution }}
              />
              <span className="text-gray-600">Execution Client:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.executionReadRate)}/s
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: colors.consensus }}
              />
              <span className="text-gray-600">Consensus Client:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.consensusReadRate)}/s
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm pt-1 border-t">
              <span className="text-gray-600 font-medium">Total Read:</span>
              <span className="font-semibold text-gray-800">
                {formatBytes(data.totalReadRate)}/s
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Format tick values for Y-axis (bytes per second)
  const formatYAxisTick = (value: number): string => {
    return `${formatBytes(value, 0)}/s`;
  };

  // Format tick values for X-axis (timestamps)
  const formatXAxisTick = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center rounded-lg ${className}`} style={{ height }}>
        <div className="text-center">
          <p className="text-lg font-medium">No block read rate data available</p>
          <p className="text-sm">Data will appear here once sufficient block read metrics are recorded</p>
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
            left: 5,
            bottom: 10,
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
            dataKey="executionReadRate"
            stackId="1"
            stroke={colors.execution}
            fill={colors.execution}
            fillOpacity={0.6}
            name="Execution Client"
          />

          <Area
            type="monotone"
            dataKey="consensusReadRate"
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

export default BlockIOReadChart;
