import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  ComposedChart,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { IndexEntry } from '../../types/report';
import { formatDuration, formatTimestamp, calculateMovingAverage, getOptimalMovingAverageWindow, calculateConfidenceBands } from '../../lib/utils';

interface ClientGroupDurationChartProps {
  data: IndexEntry[];
  className?: string;
  height?: number;
  showGrid?: boolean;
  color?: string;
  title?: string;
}

interface ChartDataPoint {
  timestamp: number;
  formattedTime: string;
  duration: number;
  runId: string;
  network: string;
  movingAverage?: number;
  upperBand?: number;
  lowerBand?: number;
  stdDev?: number;
  confidenceBandRange?: number[];
}

const ClientGroupDurationChart: React.FC<ClientGroupDurationChartProps> = ({
  data,
  className = '',
  height = 300,
  showGrid = true,
  color = '#3b82f6',
  title = 'Test Duration Over Time',
}) => {
  const navigate = useNavigate();
  
  // State for controlling line visibility
  const [visibleLines, setVisibleLines] = useState({
    duration: true,
    movingAverage: true
  });

  // Handle click on data point
  const handleDataPointClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const payload = data.activePayload[0].payload as ChartDataPoint;
      navigate(`/test/${payload.runId}`);
    }
  };

  // Handle legend click to toggle line visibility
  const handleLegendClick = (entry: any) => {
    const { dataKey } = entry;
    setVisibleLines(prev => ({
      ...prev,
      [dataKey]: !prev[dataKey as keyof typeof prev]
    }));
  };

  // Transform data for the chart
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    const sortedData = data.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    const baseData = sortedData.map((entry) => ({
      timestamp: Number(entry.timestamp),
      formattedTime: formatTimestamp(Number(entry.timestamp)),
      duration: entry.sync_info.duration,
      runId: entry.run_id,
      network: entry.network,
    }));

    // Calculate moving average and confidence bands only if we have enough data points
    if (baseData.length >= 3) {
      const withConfidenceBands = calculateConfidenceBands(baseData, 'duration');
      // Add confidence band range for area chart
      return withConfidenceBands.map(point => ({
        ...point,
        confidenceBandRange: [point.lowerBand || 0, point.upperBand || 0]
      }));
    }

    return baseData;
  }, [data]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as ChartDataPoint;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800 mb-2">{data.formattedTime}</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Duration:</span>
              <span className="font-medium text-gray-800">
                {formatDuration(data.duration)}
              </span>
            </div>
            {data.movingAverage && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Trend:</span>
                <span className="font-medium text-gray-800">
                  {formatDuration(data.movingAverage)}
                </span>
              </div>
            )}
            {data.upperBand && data.lowerBand && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">95% CI:</span>
                <span className="font-medium text-gray-800">
                  {formatDuration(data.lowerBand)} - {formatDuration(data.upperBand)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Network:</span>
              <span className="font-medium text-gray-800">{data.network}</span>
            </div>
            <div className="text-xs text-gray-500 pt-1 border-t">
              {data.runId}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Format tick values for Y-axis (duration in seconds)
  const formatYAxisTick = (value: number): string => {
    return formatDuration(value);
  };

  // Format tick values for X-axis (timestamps)
  const formatXAxisTick = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`} style={{ height }}>
        <div className="text-center text-gray-500">
          <p className="text-sm font-medium">No duration data available</p>
          <p className="text-xs">Data will appear here once tests are completed</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <div className="mb-2">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={chartData}
          margin={{
            top: 10,
            right: 10,
            left: 10,
            bottom: 30,
          }}
          onClick={handleDataPointClick}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
          )}
          
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatXAxisTick}
            stroke="#6b7280"
            fontSize={10}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          
          <YAxis
            tickFormatter={formatYAxisTick}
            stroke="#6b7280"
            fontSize={10}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
            width={60}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          <Legend
            wrapperStyle={{
              paddingTop: '10px',
              fontSize: '12px',
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
            onClick={handleLegendClick}
          />
          
          <Line
            type="monotone"
            dataKey="duration"
            stroke={color}
            strokeWidth={2}
            name="Actual Duration"
            dot={false}
            hide={!visibleLines.duration}
            activeDot={{ 
              r: 6, 
              stroke: '#3b82f6', 
              strokeWidth: 2, 
              cursor: 'pointer'
            }}
          />
          
          {/* Moving Average Line */}
          {chartData.length >= 3 && chartData[0].movingAverage !== undefined && (
            <Line
              type="monotone"
              dataKey="movingAverage"
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="5 5"
              name={`Trend (${getOptimalMovingAverageWindow(chartData.length)}-point avg)`}
              dot={false}
              hide={!visibleLines.movingAverage}
              activeDot={false}
              opacity={0.7}
            />
          )}
          
          {/* Confidence Band Area */}
          {chartData.length >= 3 && chartData[0].upperBand !== undefined && (
            <Area
              type="monotone"
              dataKey="confidenceBandRange"
              stroke="none"
              fill={color}
              fillOpacity={0.15}
              isAnimationActive={false}
              legendType="none"
            />
          )}
          
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ClientGroupDurationChart;