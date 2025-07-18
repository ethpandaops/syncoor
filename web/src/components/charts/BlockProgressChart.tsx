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

interface BlockProgressChartProps {
  data: ProgressEntry[];
  className?: string;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  color?: string;
}

interface ChartDataPoint {
  timestamp: number;
  formattedTime: string;
  blocks: number;
}

const BlockProgressChart: React.FC<BlockProgressChartProps> = ({
  data,
  className = '',
  height = 400,
  showLegend = true,
  showGrid = true,
  color = '#3b82f6',
}) => {
  // Transform data for the chart
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    return data
      .sort((a, b) => a.t - b.t)
      .map((entry) => ({
        timestamp: entry.t,
        formattedTime: formatTimestamp(entry.t),
        blocks: entry.b,
      }));
  }, [data]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as ChartDataPoint;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800 mb-2">{data.formattedTime}</p>
          <div className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-gray-600">Execution Block:</span>
            <span className="font-medium text-gray-800">
              {data.blocks.toLocaleString()}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Format tick values for Y-axis
  const formatYAxisTick = (value: number): string => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toString();
  };

  // Format tick values for X-axis
  const formatXAxisTick = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format percentage tick values for right Y-axis
  const formatPercentageTick = (value: number): string => {
    if (!chartData || chartData.length === 0) return '';
    
    const firstValue = chartData[0].blocks;
    const lastValue = chartData[chartData.length - 1].blocks;
    const range = lastValue - firstValue;
    
    if (range === 0) return '0%';
    
    const percentage = ((value - firstValue) / range) * 100;
    return `${Math.round(percentage)}%`;
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`} style={{ height }}>
        <div className="text-center text-gray-500">
          <p className="text-lg font-medium">No block progress data available</p>
          <p className="text-sm">Data will appear here once block sync progress is recorded</p>
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
            right: -20,
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
            yAxisId="left"
            domain={chartData && chartData.length > 0 ? [chartData[0].blocks, chartData[chartData.length - 1].blocks] : ['auto', 'auto']}
            tickFormatter={formatYAxisTick}
            stroke="#6b7280"
            fontSize={12}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
          />
          
          {chartData && chartData.length > 0 && (() => {
            const firstValue = chartData[0].blocks;
            const lastValue = chartData[chartData.length - 1].blocks;
            const range = lastValue - firstValue;
            const step = range / 4; // 5 ticks (0%, 25%, 50%, 75%, 100%)
            const ticks = [
              firstValue,      // 0%
              firstValue + step,    // 25%
              firstValue + step * 2, // 50%
              firstValue + step * 3, // 75%
              lastValue        // 100%
            ];
            
            return (
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[firstValue, lastValue]}
                type="number"
                ticks={ticks}
                tickFormatter={formatPercentageTick}
                stroke="#6b7280"
                fontSize={12}
                axisLine={{ stroke: '#d1d5db' }}
                tickLine={{ stroke: '#d1d5db' }}
              />
            );
          })()}

          <Tooltip content={<CustomTooltip />} />

          {showLegend && (
            <Legend
              wrapperStyle={{
                paddingTop: '20px',
                fontSize: '14px',
                color: '#374151',
              }}
            />
          )}

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="blocks"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: color, strokeWidth: 2 }}
            name="Execution Blocks"
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BlockProgressChart;
