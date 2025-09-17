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
  executionRead: number;
  executionWrite: number;
  consensusRead: number;
  consensusWrite: number;
  totalRead: number;
  totalWrite: number;
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
  // Transform data for the chart
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    return data
      .filter((entry) => 
        entry.bre !== undefined && 
        entry.bwe !== undefined && 
        entry.brc !== undefined && 
        entry.bwc !== undefined
      )
      .sort((a, b) => a.t - b.t)
      .map((entry) => ({
        timestamp: entry.t,
        formattedTime: formatTimestamp(entry.t),
        executionRead: entry.bre,
        executionWrite: entry.bwe,
        consensusRead: entry.brc,
        consensusWrite: entry.bwc,
        totalRead: entry.bre + entry.brc,
        totalWrite: entry.bwe + entry.bwc,
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
            <div className="text-sm font-medium text-gray-700 mb-1">Execution Client:</div>
            <div className="flex items-center gap-2 text-sm ml-3">
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: colors.executionRead }}
              />
              <span className="text-gray-600">Read:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.executionRead)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm ml-3">
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: colors.executionWrite }}
              />
              <span className="text-gray-600">Write:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.executionWrite)}
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
                {formatBytes(data.consensusRead)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm ml-3">
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: colors.consensusWrite }}
              />
              <span className="text-gray-600">Write:</span>
              <span className="font-medium text-gray-800">
                {formatBytes(data.consensusWrite)}
              </span>
            </div>
            
            <div className="flex items-center gap-4 text-sm pt-2 border-t">
              <div className="flex items-center gap-1">
                <span className="text-gray-600 font-medium">Total Read:</span>
                <span className="font-semibold text-gray-800">
                  {formatBytes(data.totalRead)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-600 font-medium">Total Write:</span>
                <span className="font-semibold text-gray-800">
                  {formatBytes(data.totalWrite)}
                </span>
              </div>
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
          <p className="text-lg font-medium">No block I/O data available</p>
          <p className="text-sm">Data will appear here once block I/O metrics are recorded</p>
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
            dataKey="executionRead"
            stroke={colors.executionRead}
            strokeWidth={2}
            dot={false}
            name="EL Read"
          />
          
          <Line
            type="monotone"
            dataKey="executionWrite"
            stroke={colors.executionWrite}
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 5"
            name="EL Write"
          />
          
          <Line
            type="monotone"
            dataKey="consensusRead"
            stroke={colors.consensusRead}
            strokeWidth={2}
            dot={false}
            name="CL Read"
          />
          
          <Line
            type="monotone"
            dataKey="consensusWrite"
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