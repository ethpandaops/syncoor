import React from 'react';
import { TestReport } from '../../types/report';
import { formatDuration, getClientDisplayName, calculateSyncRate } from '../../lib/utils';

interface PerformanceMatrixProps {
  data: TestReport[];
  className?: string;
  metric?: 'duration' | 'sync_rate' | 'disk_usage' | 'peer_count';
  showTooltips?: boolean;
}

interface MatrixCell {
  executionClient: string;
  consensusClient: string;
  value: number;
  displayValue: string;
  report: TestReport;
}

interface MatrixData {
  executionClients: string[];
  consensusClients: string[];
  cells: MatrixCell[];
  minValue: number;
  maxValue: number;
}

const PerformanceMatrix: React.FC<PerformanceMatrixProps> = ({
  data,
  className = '',
  metric = 'duration',
  showTooltips = true,
}) => {
  // Transform data into matrix format
  const matrixData: MatrixData = React.useMemo(() => {
    if (!data || data.length === 0) {
      return {
        executionClients: [],
        consensusClients: [],
        cells: [],
        minValue: 0,
        maxValue: 0,
      };
    }

    const executionClients = Array.from(
      new Set(data.map(report => getClientDisplayName(report.execution_client)))
    ).sort();

    const consensusClients = Array.from(
      new Set(data.map(report => getClientDisplayName(report.consensus_client)))
    ).sort();

    const cells: MatrixCell[] = [];
    let minValue = Infinity;
    let maxValue = -Infinity;

    for (const executionClient of executionClients) {
      for (const consensusClient of consensusClients) {
        const report = data.find(
          r => getClientDisplayName(r.execution_client) === executionClient &&
               getClientDisplayName(r.consensus_client) === consensusClient
        );

        if (report) {
          let value: number;
          let displayValue: string;

          switch (metric) {
            case 'duration':
              value = report.sync_info.duration;
              displayValue = formatDuration(value);
              break;
            case 'sync_rate':
              value = report.progress ? calculateSyncRate(report.progress) : 0;
              displayValue = `${value.toFixed(2)} b/s`;
              break;
            case 'disk_usage': {
              const lastProgress = report.progress && report.progress.length > 0
                ? report.progress[report.progress.length - 1]
                : null;
              value = lastProgress ? (lastProgress.de + lastProgress.dc) : 0;
              displayValue = value > 0 ? `${(value / (1024 ** 3)).toFixed(1)} GB` : 'N/A';
              break;
            }
            case 'peer_count': {
              const avgProgress = report.progress && report.progress.length > 0
                ? report.progress.reduce((sum, p) => sum + p.pe + p.pc, 0) / report.progress.length
                : 0;
              value = avgProgress;
              displayValue = value > 0 ? Math.round(value).toString() : 'N/A';
              break;
            }
            default:
              value = 0;
              displayValue = 'N/A';
          }

          if (value !== 0 && isFinite(value)) {
            minValue = Math.min(minValue, value);
            maxValue = Math.max(maxValue, value);
          }

          cells.push({
            executionClient,
            consensusClient,
            value,
            displayValue,
            report,
          });
        }
      }
    }

    return {
      executionClients,
      consensusClients,
      cells,
      minValue: isFinite(minValue) ? minValue : 0,
      maxValue: isFinite(maxValue) ? maxValue : 0,
    };
  }, [data, metric]);

  // Get cell color based on performance value
  const getCellColor = (value: number): string => {
    if (value === 0 || !isFinite(value)) {
      return 'bg-gray-100 text-gray-400';
    }

    const { minValue, maxValue } = matrixData;
    if (minValue === maxValue) {
      return 'bg-blue-100 text-blue-800';
    }

    const normalizedValue = (value - minValue) / (maxValue - minValue);

    // For duration, lower is better (green), higher is worse (red)
    // For sync_rate and peer_count, higher is better (green), lower is worse (red)
    const reversed = metric === 'duration' || metric === 'disk_usage';
    const intensity = reversed ? 1 - normalizedValue : normalizedValue;

    if (intensity >= 0.8) {
      return 'bg-green-200 text-green-800';
    } else if (intensity >= 0.6) {
      return 'bg-green-100 text-green-700';
    } else if (intensity >= 0.4) {
      return 'bg-yellow-100 text-yellow-700';
    } else if (intensity >= 0.2) {
      return 'bg-orange-100 text-orange-700';
    } else {
      return 'bg-red-100 text-red-700';
    }
  };

  // Get metric display name
  const getMetricDisplayName = (): string => {
    switch (metric) {
      case 'duration':
        return 'Sync Duration';
      case 'sync_rate':
        return 'Sync Rate (blocks/sec)';
      case 'disk_usage':
        return 'Final Disk Usage';
      case 'peer_count':
        return 'Average Peer Count';
      default:
        return 'Performance';
    }
  };

  if (matrixData.executionClients.length === 0 || matrixData.consensusClients.length === 0) {
    return (
      <div className={`flex items-center justify-center rounded-lg p-8 ${className}`}>
        <div className="text-center">
          <p className="text-lg font-medium">No performance data available</p>
          <p className="text-sm">Data will appear here once test results are available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">
          {getMetricDisplayName()} Performance Matrix
        </h3>
        <p className="text-sm text-gray-600">
          Comparison of {getMetricDisplayName().toLowerCase()} across client combinations
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="w-32 h-12 text-left text-sm font-medium text-gray-700 p-2">
                  <div className="flex items-center justify-center">
                    <span className="transform -rotate-45 origin-center">Consensus</span>
                  </div>
                </th>
                {matrixData.consensusClients.map((client) => (
                  <th
                    key={client}
                    className="h-12 text-center text-sm font-medium text-gray-700 p-2 border-b"
                  >
                    <div className="flex items-center justify-center">
                      <span className="transform -rotate-45 origin-center whitespace-nowrap">
                        {client}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                <th className="text-left text-sm font-medium text-gray-700 p-2">
                  Execution ↓
                </th>
                {matrixData.consensusClients.map((client) => (
                  <th key={client} className="w-24 border-b" />
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixData.executionClients.map((executionClient) => (
                <tr key={executionClient}>
                  <td className="text-sm font-medium text-gray-700 p-2 border-r">
                    <div className="flex items-center justify-end">
                      <span className="whitespace-nowrap">{executionClient}</span>
                    </div>
                  </td>
                  {matrixData.consensusClients.map((consensusClient) => {
                    const cell = matrixData.cells.find(
                      c => c.executionClient === executionClient &&
                           c.consensusClient === consensusClient
                    );

                    if (!cell) {
                      return (
                        <td key={consensusClient} className="w-24 h-16 border border-gray-200">
                          <div className="h-full bg-gray-50 flex items-center justify-center">
                            <span className="text-xs text-gray-400">N/A</span>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={consensusClient} className="w-24 h-16 border border-gray-200">
                        <div
                          className={`h-full flex items-center justify-center cursor-pointer transition-opacity hover:opacity-80 ${getCellColor(cell.value)}`}
                          title={showTooltips ? `${executionClient} + ${consensusClient}: ${cell.displayValue}` : undefined}
                        >
                          <span className="text-xs font-medium text-center px-1 leading-tight">
                            {cell.displayValue}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-200 rounded"></div>
          <span>Best performance</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-100 rounded"></div>
          <span>Average performance</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-100 rounded"></div>
          <span>Poor performance</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-100 rounded"></div>
          <span>No data</span>
        </div>
      </div>
    </div>
  );
};

export default PerformanceMatrix;
