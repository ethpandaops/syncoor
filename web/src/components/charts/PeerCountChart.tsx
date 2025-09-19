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
import { formatTimestamp } from '../../lib/utils';

interface PeerCountChartProps {
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
}

const PeerCountChart: React.FC<PeerCountChartProps> = ({
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
        execution: entry.pe,
        consensus: entry.pc,
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
              <span className="text-gray-600">Execution Peers:</span>
              <span className="font-medium text-gray-800">
                {data.execution.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.consensus }}
              />
              <span className="text-gray-600">Consensus Peers:</span>
              <span className="font-medium text-gray-800">
                {data.consensus.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm pt-1 border-t">
              <span className="text-gray-600 font-medium">Total:</span>
              <span className="font-semibold text-gray-800">
                {(data.execution + data.consensus).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Format tick values for Y-axis
  const formatYAxisTick = (value: number): string => {
    return value.toString();
  };

  // Format tick values for X-axis
  const formatXAxisTick = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center rounded-lg ${className}`} style={{ height }}>
        <div className="text-center">
          <p className="text-lg font-medium">No peer count data available</p>
          <p className="text-sm">Data will appear here once peer connections are recorded</p>
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
            dataKey="execution"
            stroke={colors.execution}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: colors.execution, strokeWidth: 2 }}
            name="Execution Peers"
            connectNulls={false}
          />

          <Line
            type="monotone"
            dataKey="consensus"
            stroke={colors.consensus}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: colors.consensus, strokeWidth: 2 }}
            name="Consensus Peers"
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PeerCountChart;
