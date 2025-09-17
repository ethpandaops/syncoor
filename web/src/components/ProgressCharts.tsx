import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { 
  BlockProgressChart, 
  SlotProgressChart, 
  DiskUsageChart, 
  PeerCountChart, 
  MemoryUsageChart, 
  BlockIOChart, 
  CPUUsageChart 
} from './charts';
import { transformProgressPoints } from '../lib/chartUtils';
import { ProgressPoint } from '../types/syncoor';
import { ProgressEntry } from '../types/report';

interface ProgressChartsProps {
  progressHistory?: ProgressPoint[];
  progressData?: ProgressEntry[];
  className?: string;
  title?: string;
  showTitle?: boolean;
  compact?: boolean;
}

/**
 * Reusable component for displaying progress charts
 * Can be used in both TestDetails page and live test details
 */
export const ProgressCharts: React.FC<ProgressChartsProps> = ({
  progressHistory,
  progressData,
  className = '',
  title = 'Progress Over Time',
  showTitle = true,
  compact = false,
}) => {
  // Transform data for chart components
  const chartData = React.useMemo(() => {
    if (progressData) {
      // Use progressData directly if provided (already in ProgressEntry format)
      return progressData;
    }
    if (progressHistory && progressHistory.length > 0) {
      // Transform progressHistory to ProgressEntry format
      return transformProgressPoints(progressHistory);
    }
    return [];
  }, [progressHistory, progressData]);

  // Check if Docker metrics data is available
  const hasMemoryData = React.useMemo(() => {
    return chartData.some(entry => entry.me !== undefined && entry.mc !== undefined);
  }, [chartData]);

  const hasBlockIOData = React.useMemo(() => {
    return chartData.some(entry => 
      entry.bre !== undefined && 
      entry.bwe !== undefined && 
      entry.brc !== undefined && 
      entry.bwc !== undefined
    );
  }, [chartData]);

  const hasCPUData = React.useMemo(() => {
    return chartData.some(entry => entry.ce !== undefined && entry.cc !== undefined);
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        {showTitle && <h3 className="text-lg font-semibold">{title}</h3>}
        <Card className="p-6">
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-medium">No progress data available</p>
            <p className="text-sm">This test may not have recorded detailed progress information</p>
          </div>
        </Card>
      </div>
    );
  }

  const chartHeight = compact ? 280 : 320;

  return (
    <div className={`space-y-4 ${className}`}>
      {showTitle && <h3 className="text-lg font-semibold">{title}</h3>}
      
      <div className={`grid gap-4 ${compact ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'}`}>
        <Card>
          <CardHeader className={compact ? "pb-3" : undefined}>
            <CardTitle className={compact ? "text-sm" : undefined}>Execution Block Progress</CardTitle>
          </CardHeader>
          <CardContent className={compact ? "pt-0" : undefined}>
            <div className="w-full" style={{ height: chartHeight }}>
              <BlockProgressChart 
                data={chartData} 
                color="#3b82f6"
                height={chartHeight}
                showLegend={!compact}
                showPercentageAxis={!compact}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={compact ? "pb-3" : undefined}>
            <CardTitle className={compact ? "text-sm" : undefined}>Consensus Slot Progress</CardTitle>
          </CardHeader>
          <CardContent className={compact ? "pt-0" : undefined}>
            <div className="w-full" style={{ height: chartHeight }}>
              <SlotProgressChart 
                data={chartData} 
                color="#10b981"
                height={chartHeight}
                showLegend={!compact}
                showPercentageAxis={!compact}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={compact ? "pb-3" : undefined}>
            <CardTitle className={compact ? "text-sm" : undefined}>Disk Usage</CardTitle>
          </CardHeader>
          <CardContent className={compact ? "pt-0" : undefined}>
            <div className="w-full" style={{ height: chartHeight }}>
              <DiskUsageChart 
                data={chartData}
                height={chartHeight}
                showLegend={!compact}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={compact ? "pb-3" : undefined}>
            <CardTitle className={compact ? "text-sm" : undefined}>Peer Connections</CardTitle>
          </CardHeader>
          <CardContent className={compact ? "pt-0" : undefined}>
            <div className="w-full" style={{ height: chartHeight }}>
              <PeerCountChart 
                data={chartData}
                height={chartHeight}
                showLegend={!compact}
              />
            </div>
          </CardContent>
        </Card>

        {hasMemoryData && (
          <Card>
            <CardHeader className={compact ? "pb-3" : undefined}>
              <CardTitle className={compact ? "text-sm" : undefined}>Memory Usage</CardTitle>
            </CardHeader>
            <CardContent className={compact ? "pt-0" : undefined}>
              <div className="w-full" style={{ height: chartHeight }}>
                <MemoryUsageChart 
                  data={chartData}
                  height={chartHeight}
                  showLegend={!compact}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {hasBlockIOData && (
          <Card>
            <CardHeader className={compact ? "pb-3" : undefined}>
              <CardTitle className={compact ? "text-sm" : undefined}>Block I/O</CardTitle>
            </CardHeader>
            <CardContent className={compact ? "pt-0" : undefined}>
              <div className="w-full" style={{ height: chartHeight }}>
                <BlockIOChart 
                  data={chartData}
                  height={chartHeight}
                  showLegend={!compact}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {hasCPUData && (
          <Card>
            <CardHeader className={compact ? "pb-3" : undefined}>
              <CardTitle className={compact ? "text-sm" : undefined}>CPU Usage</CardTitle>
            </CardHeader>
            <CardContent className={compact ? "pt-0" : undefined}>
              <div className="w-full" style={{ height: chartHeight }}>
                <CPUUsageChart 
                  data={chartData}
                  height={chartHeight}
                  showLegend={!compact}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ProgressCharts;