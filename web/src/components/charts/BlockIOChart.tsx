import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ProgressEntry } from '../../types/report';
import { formatTimestamp, formatBytes } from '../../lib/utils';

interface BlockIOChartProps {
  data: ProgressEntry[];
  className?: string;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  colors?: {
    executionRead?: string;
    executionWrite?: string;
    consensusRead?: string;
    consensusWrite?: string;
  };
}

interface ChartDataPoint {
  timestamp: number;
  formattedTime: string;
  executionReadRate: number;
  executionWriteRate: number;
  consensusReadRate: number;
  consensusWriteRate: number;
  totalReadRate: number;
  totalWriteRate: number;
}

const BlockIOChart: React.FC<BlockIOChartProps> = ({
  data,
  className = '',
  height = 400,
  showLegend = true,
  showGrid = true,
  colors = {
    executionRead: '#3b82f6',
    executionWrite: '#1d4ed8',
    consensusRead: '#10b981',
    consensusWrite: '#047857',
  },
}) => {
  // Transform data for the chart - calculate rates (bytes per second)
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    const filteredData = data
      .filter((entry) =>
        entry.bre !== undefined &&
        entry.bwe !== undefined &&
        entry.brc !== undefined &&
        entry.bwc !== undefined
      )
      .sort((a, b) => a.t - b.t);

    if (filteredData.length < 2) return [];

    const rateData: ChartDataPoint[] = [];

    for (let i = 1; i < filteredData.length; i++) {
      const current = filteredData[i];
      const previous = filteredData[i - 1];

      const timeDiff = current.t - previous.t;
      if (timeDiff <= 0) continue; // Skip if no time difference

      // Calculate rates (bytes per second)
      const executionReadRate = Math.max(0, (current.bre - previous.bre) / timeDiff);
      const executionWriteRate = Math.max(0, (current.bwe - previous.bwe) / timeDiff);
      const consensusReadRate = Math.max(0, (current.brc - previous.brc) / timeDiff);
      const consensusWriteRate = Math.max(0, (current.bwc - previous.bwc) / timeDiff);

      rateData.push({
        timestamp: current.t,
        formattedTime: formatTimestamp(current.t),
        executionReadRate,
        executionWriteRate,
        consensusReadRate,
        consensusWriteRate,
        totalReadRate: executionReadRate + consensusReadRate,
        totalWriteRate: executionWriteRate + consensusWriteRate,
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
            <div className="text-sm font-medium text-gray-700 mb-1">Execution Client:</div>
            <div className="flex items-center gap-2 text-sm ml-3">
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: colors.executionRead }}
              />
              <span className="text-gray-600">Read:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.executionReadRate)}/s
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm ml-3">
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: colors.executionWrite }}
              />
              <span className="text-gray-600">Write:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.executionWriteRate)}/s
              </span>
            </div>

            <div className="text-sm font-medium text-gray-700 mb-1 mt-2">Consensus Client:</div>
            <div className="flex items-center gap-2 text-sm ml-3">
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: colors.consensusRead }}
              />
              <span className="text-gray-600">Read:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.consensusReadRate)}/s
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm ml-3">
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: colors.consensusWrite }}
              />
              <span className="text-gray-600">Write:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.consensusWriteRate)}/s
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm pt-2 border-t">
              <div className="flex items-center gap-1">
                <span className="text-gray-600 font-medium">Total Read:</span>
                <span className="font-semibold text-gray-800">
                  {formatBytes(data.totalReadRate)}/s
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-600 font-medium">Total Write:</span>
                <span className="font-semibold text-gray-800">
                  {formatBytes(data.totalWriteRate)}/s
                </span>
              </div>
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
          <p className="text-lg font-medium">No block I/O rate data available</p>
          <p className="text-sm">Data will appear here once sufficient block I/O metrics are recorded</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
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

          <Line
            type="monotone"
            dataKey="executionReadRate"
            stroke={colors.executionRead}
            strokeWidth={2}
            dot={false}
            name="EL Read"
          />

          <Line
            type="monotone"
            dataKey="executionWriteRate"
            stroke={colors.executionWrite}
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 5"
            name="EL Write"
          />

          <Line
            type="monotone"
            dataKey="consensusReadRate"
            stroke={colors.consensusRead}
            strokeWidth={2}
            dot={false}
            name="CL Read"
          />

          <Line
            type="monotone"
            dataKey="consensusWriteRate"
            stroke={colors.consensusWrite}
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 5"
            name="CL Write"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BlockIOChart;
