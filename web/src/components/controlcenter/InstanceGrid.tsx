import React from 'react';
import { InstanceHealth } from '../../types/controlCenter';
import InstanceStatusCard from './InstanceStatusCard';

interface InstanceGridProps {
  instances: InstanceHealth[];
  isLoading?: boolean;
  error?: Error | null;
}

const InstanceGrid: React.FC<InstanceGridProps> = ({ instances, isLoading, error }) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-40 bg-muted/50 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
        <p className="font-medium">Failed to load instances</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    );
  }

  if (!instances || instances.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>No instances configured</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {instances.map((instance) => (
        <InstanceStatusCard key={instance.name} instance={instance} />
      ))}
    </div>
  );
};

export default InstanceGrid;
